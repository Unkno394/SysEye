using System.Globalization;
using System.Text;
using System.Text.Json;
using Application.DTO;
using Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Extensions;

namespace Web.Controllers;

[Authorize]
[ApiController]
[Route("api/export")]
[ProducesResponseType(401)]
public class ExportController(
    IAgentService agentService,
    ICommandService commandService,
    ITaskService taskService,
    IAnalyticsService analyticsService) : ControllerBase
{
    private const int ExportPageSize = 100000;

    [HttpGet]
    public async Task<IActionResult> Export(
        [FromQuery] string? format,
        [FromQuery] Guid? agentId,
        CancellationToken cancellationToken)
    {
        var normalizedFormat = NormalizeFormat(format);
        if (normalizedFormat is null)
        {
            return BadRequest("Поддерживаются только форматы Json, Csv и Pdf.");
        }

        var userId = User.GetUserId();
        var exportData = await BuildExportDataAsync(userId, agentId, cancellationToken);

        return normalizedFormat switch
        {
            "json" => File(
                Encoding.UTF8.GetBytes(JsonSerializer.Serialize(exportData, new JsonSerializerOptions { WriteIndented = true })),
                "application/json; charset=utf-8",
                BuildFileName(exportData, "json")),
            "csv" => File(
                Encoding.UTF8.GetBytes(BuildCsv(exportData)),
                "text/csv; charset=utf-8",
                BuildFileName(exportData, "csv")),
            "pdf" => File(
                BuildPdf(BuildPdfLines(exportData)),
                "application/pdf",
                BuildFileName(exportData, "pdf")),
            _ => BadRequest("Неподдерживаемый формат."),
        };
    }

    private async Task<ExportPayload> BuildExportDataAsync(Guid userId, Guid? agentId, CancellationToken cancellationToken)
    {
        var commands = await commandService.GetUserCommandsAsync(userId, ExportPageSize, 0, cancellationToken);
        var commandItems = commands.Items ?? [];

        if (agentId.HasValue)
        {
            var agent = await agentService.Get(agentId.Value, userId, cancellationToken);
            if (agent is null)
            {
                throw new KeyNotFoundException("Агент не найден.");
            }

            var executions = await taskService.GetTasksByAgent(userId, agentId.Value, ExportPageSize, 0, cancellationToken);
            var agentAnalytics = await analyticsService.GetAgentAnalyticsAsync(userId, agentId.Value, cancellationToken);
            var agentMetrics = await analyticsService.GetAgentMetricsAsync(userId, agentId.Value, cancellationToken);
            var agentRatings = await analyticsService.GetAgentRatingsAsync(userId, cancellationToken);

            return new ExportPayload
            {
                GeneratedAtUtc = DateTime.UtcNow,
                Scope = "agent",
                Agent = agent,
                Agents = [agent],
                Commands = commandItems,
                Executions = executions.Items ?? [],
                Analytics = new ExportAnalyticsPayload
                {
                    Agents = [agentAnalytics],
                    Commands = [],
                    AgentMetrics = [agentMetrics],
                    AgentRatings = agentRatings.Where(item => item.AgentId == agent.Id).ToArray(),
                },
            };
        }

        var agents = await agentService.GetUserAgents(userId, ExportPageSize, 0, cancellationToken);
        var allExecutions = await taskService.GetTasksByUserAsync(userId, ExportPageSize, 0, cancellationToken);
        var agentAnalyticsAll = await analyticsService.GetAgentsAnalyticsAsync(userId, cancellationToken);
        var commandAnalyticsAll = await analyticsService.GetCommandsAnalyticsAsync(userId, cancellationToken);
        var agentRatingsAll = await analyticsService.GetAgentRatingsAsync(userId, cancellationToken);
        var agentMetricsAll = await Task.WhenAll(
            (agents.Items ?? [])
                .Select(agent => analyticsService.GetAgentMetricsAsync(userId, agent.Id, cancellationToken)));

        return new ExportPayload
        {
            GeneratedAtUtc = DateTime.UtcNow,
            Scope = "all",
            Agents = agents.Items ?? [],
            Commands = commandItems,
            Executions = allExecutions.Items ?? [],
            Analytics = new ExportAnalyticsPayload
            {
                Agents = agentAnalyticsAll,
                Commands = commandAnalyticsAll,
                AgentMetrics = agentMetricsAll,
                AgentRatings = agentRatingsAll,
            },
        };
    }

    private static string? NormalizeFormat(string? format)
    {
        return format?.Trim().ToLowerInvariant() switch
        {
            "json" => "json",
            "csv" => "csv",
            "pdf" => "pdf",
            _ => null,
        };
    }

    private static string BuildFileName(ExportPayload payload, string extension)
    {
        var prefix = payload.Scope == "agent" && !string.IsNullOrWhiteSpace(payload.Agent?.Name)
            ? SanitizeFileName(payload.Agent.Name)
            : "syseye-export";

        return $"{prefix}-{payload.GeneratedAtUtc:yyyyMMdd-HHmmss}.{extension}";
    }

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            builder.Append(invalid.Contains(character) ? '-' : character);
        }

        return builder.ToString().Trim();
    }

    private static string BuildCsv(ExportPayload payload)
    {
        var builder = new StringBuilder();
        builder.Append('\uFEFF');

        builder.AppendLine("section,generated_at_utc,scope");
        builder.AppendLine(string.Join(",", EscapeCsv("meta"), EscapeCsv(payload.GeneratedAtUtc.ToString("O")), EscapeCsv(payload.Scope)));

        builder.AppendLine();
        builder.AppendLine("agents");
        builder.AppendLine("id,name,os,ip_address,distribution,last_heartbeat_at");
        foreach (var agent in payload.Agents)
        {
            builder.AppendLine(string.Join(",",
                EscapeCsv(agent.Id),
                EscapeCsv(agent.Name),
                EscapeCsv(agent.Os?.ToString()),
                EscapeCsv(agent.IpAddress),
                EscapeCsv(agent.Distribution),
                EscapeCsv(agent.LastHeartbeatAt.ToString("O"))));
        }

        builder.AppendLine();
        builder.AppendLine("commands");
        builder.AppendLine("id,name,description,is_system,log_regex");
        foreach (var command in payload.Commands)
        {
            builder.AppendLine(string.Join(",",
                EscapeCsv(command.Id),
                EscapeCsv(command.Name),
                EscapeCsv(command.Description),
                EscapeCsv(command.IsSystem),
                EscapeCsv(command.LogRegex)));
        }

        builder.AppendLine();
        builder.AppendLine("executions");
        builder.AppendLine("id,agent_id,command_id,title,status,started_at,completed_at,duration_seconds,exit_code,result_summary");
        foreach (var execution in payload.Executions)
        {
            builder.AppendLine(string.Join(",",
                EscapeCsv(execution.Id),
                EscapeCsv(execution.AgentId),
                EscapeCsv(execution.CommandId),
                EscapeCsv(execution.Title),
                EscapeCsv(execution.Status),
                EscapeCsv(execution.StartedAt.ToString("O")),
                EscapeCsv(execution.CompletedAt?.ToString("O")),
                EscapeCsv(execution.DurationSeconds?.ToString(CultureInfo.InvariantCulture)),
                EscapeCsv(execution.ExitCode),
                EscapeCsv(execution.ResultSummary)));
        }

        builder.AppendLine();
        builder.AppendLine("agent_analytics");
        builder.AppendLine("agent_id,agent_name,total_executions,total_errors,total_success_rate,today_executions,today_errors,today_success_rate");
        foreach (var analytics in payload.Analytics.Agents)
        {
            builder.AppendLine(string.Join(",",
                EscapeCsv(analytics.AgentId),
                EscapeCsv(analytics.AgentName),
                EscapeCsv(analytics.Total?.Executions),
                EscapeCsv(analytics.Total?.Errors),
                EscapeCsv(analytics.Total is null ? null : analytics.Total.SuccessRate.ToString(CultureInfo.InvariantCulture)),
                EscapeCsv(analytics.Today?.Executions),
                EscapeCsv(analytics.Today?.Errors),
                EscapeCsv(analytics.Today is null ? null : analytics.Today.SuccessRate.ToString(CultureInfo.InvariantCulture))));
        }

        builder.AppendLine();
        builder.AppendLine("command_analytics");
        builder.AppendLine("command_id,command_name,total_executions,total_errors,total_success_rate,today_executions,today_errors,today_success_rate");
        foreach (var analytics in payload.Analytics.Commands)
        {
            builder.AppendLine(string.Join(",",
                EscapeCsv(analytics.CommandId),
                EscapeCsv(analytics.CommandName),
                EscapeCsv(analytics.Total?.Executions),
                EscapeCsv(analytics.Total?.Errors),
                EscapeCsv(analytics.Total is null ? null : analytics.Total.SuccessRate.ToString(CultureInfo.InvariantCulture)),
                EscapeCsv(analytics.Today?.Executions),
                EscapeCsv(analytics.Today?.Errors),
                EscapeCsv(analytics.Today is null ? null : analytics.Today.SuccessRate.ToString(CultureInfo.InvariantCulture))));
        }

        if (payload.Analytics.AgentMetrics.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine("agent_metrics");
            builder.AppendLine("agent_id,total_runs,successful_runs,failed_runs,running_runs,queued_runs,runs_today,errors_today,average_duration_seconds,success_rate");
            foreach (var metrics in payload.Analytics.AgentMetrics)
            {
                builder.AppendLine(string.Join(",",
                    EscapeCsv(metrics.AgentId),
                    EscapeCsv(metrics.TotalRuns),
                    EscapeCsv(metrics.SuccessfulRuns),
                    EscapeCsv(metrics.FailedRuns),
                    EscapeCsv(metrics.RunningRuns),
                    EscapeCsv(metrics.QueuedRuns),
                    EscapeCsv(metrics.RunsToday),
                    EscapeCsv(metrics.ErrorsToday),
                    EscapeCsv(metrics.AverageDurationSeconds.ToString(CultureInfo.InvariantCulture)),
                    EscapeCsv(metrics.SuccessRate.ToString(CultureInfo.InvariantCulture))));
            }
        }

        if (payload.Analytics.AgentRatings.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine("agent_ratings");
            builder.AppendLine("rank,agent_id,agent_name,total_runs,errors_today,average_duration_seconds,success_rate,stability_score,speed_score,overall_score");
            foreach (var rating in payload.Analytics.AgentRatings)
            {
                builder.AppendLine(string.Join(",",
                    EscapeCsv(rating.Rank),
                    EscapeCsv(rating.AgentId),
                    EscapeCsv(rating.AgentName),
                    EscapeCsv(rating.TotalRuns),
                    EscapeCsv(rating.ErrorsToday),
                    EscapeCsv(rating.AverageDurationSeconds.ToString(CultureInfo.InvariantCulture)),
                    EscapeCsv(rating.SuccessRate.ToString(CultureInfo.InvariantCulture)),
                    EscapeCsv(rating.StabilityScore.ToString(CultureInfo.InvariantCulture)),
                    EscapeCsv(rating.SpeedScore.ToString(CultureInfo.InvariantCulture)),
                    EscapeCsv(rating.OverallScore.ToString(CultureInfo.InvariantCulture))));
            }
        }

        return builder.ToString();
    }

    private static string EscapeCsv(object? value)
    {
        var text = Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
        var escaped = text.Replace("\"", "\"\"");
        return $"\"{escaped}\"";
    }

    private static List<string> BuildPdfLines(ExportPayload payload)
    {
        var lines = new List<string>
        {
            "SysEye export report",
            $"Generated at (UTC): {payload.GeneratedAtUtc:O}",
            $"Scope: {payload.Scope}",
            $"Agents: {payload.Agents.Count}",
            $"Commands: {payload.Commands.Count}",
            $"Executions: {payload.Executions.Count}",
            string.Empty,
            "Agents",
        };

        lines.AddRange(payload.Agents.Take(20).Select(agent =>
            $"- {ToPdfText(agent.Name)} | {agent.IpAddress ?? "-"} | {agent.Distribution ?? agent.Os?.ToString() ?? "-"}"));

        lines.Add(string.Empty);
        lines.Add("Latest executions");
        lines.AddRange(payload.Executions.Take(30).Select(execution =>
            $"- {ToPdfText(execution.Title)} | {execution.Status} | {execution.StartedAt:yyyy-MM-dd HH:mm:ss}"));

        if (payload.Analytics.Agents.Count > 0)
        {
            lines.Add(string.Empty);
            lines.Add("Agent analytics");
            lines.AddRange(payload.Analytics.Agents.Take(20).Select(item =>
                $"- {ToPdfText(item.AgentName ?? item.AgentId.ToString())} | total={item.Total?.Executions ?? 0} | success={item.Total?.SuccessRate.ToString("0.##", CultureInfo.InvariantCulture) ?? "0"}%"));
        }

        if (payload.Analytics.Commands.Count > 0)
        {
            lines.Add(string.Empty);
            lines.Add("Command analytics");
            lines.AddRange(payload.Analytics.Commands.Take(20).Select(item =>
                $"- {ToPdfText(item.CommandName ?? item.CommandId.ToString())} | total={item.Total?.Executions ?? 0} | success={item.Total?.SuccessRate.ToString("0.##", CultureInfo.InvariantCulture) ?? "0"}%"));
        }

        if (payload.Analytics.AgentMetrics.Count > 0)
        {
            lines.Add(string.Empty);
            lines.Add("Agent metrics");
            lines.AddRange(payload.Analytics.AgentMetrics.Take(20).Select(item =>
                $"- {item.AgentId} | total={item.TotalRuns} | avg={item.AverageDurationSeconds.ToString("0.##", CultureInfo.InvariantCulture)}s | today_errors={item.ErrorsToday}"));
        }

        if (payload.Analytics.AgentRatings.Count > 0)
        {
            lines.Add(string.Empty);
            lines.Add("Agent rating");
            lines.AddRange(payload.Analytics.AgentRatings.Take(10).Select(item =>
                $"- #{item.Rank} {ToPdfText(item.AgentName)} | overall={item.OverallScore.ToString("0.##", CultureInfo.InvariantCulture)} | stability={item.StabilityScore.ToString("0.##", CultureInfo.InvariantCulture)} | speed={item.SpeedScore.ToString("0.##", CultureInfo.InvariantCulture)}"));
        }

        return lines;
    }

    private static string ToPdfText(string value)
    {
        return new string(value.Select(character => character <= 127 ? character : '?').ToArray());
    }

    private static byte[] BuildPdf(IReadOnlyList<string> lines)
    {
        var contentBuilder = new StringBuilder();
        contentBuilder.AppendLine("BT");
        contentBuilder.AppendLine("/F1 12 Tf");
        contentBuilder.AppendLine("50 780 Td");

        for (var index = 0; index < lines.Count; index++)
        {
            var escaped = EscapePdfText(lines[index]);
            contentBuilder.AppendLine(index == 0
                ? $"({escaped}) Tj"
                : $"0 -16 Td ({escaped}) Tj");
        }

        contentBuilder.AppendLine("ET");

        var content = contentBuilder.ToString();

        var objects = new List<string>
        {
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
            $"5 0 obj << /Length {Encoding.ASCII.GetByteCount(content)} >> stream\n{content}endstream\nendobj\n",
        };

        using var stream = new MemoryStream();
        using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true);
        writer.NewLine = "\n";
        writer.Write("%PDF-1.4\n");
        writer.Flush();

        var offsets = new List<long> { 0 };
        foreach (var obj in objects)
        {
            offsets.Add(stream.Position);
            writer.Write(obj);
            writer.Flush();
        }

        var xrefPosition = stream.Position;
        writer.Write($"xref\n0 {objects.Count + 1}\n");
        writer.Write("0000000000 65535 f \n");
        for (var index = 1; index <= objects.Count; index++)
        {
            writer.Write($"{offsets[index]:0000000000} 00000 n \n");
        }

        writer.Write($"trailer << /Size {objects.Count + 1} /Root 1 0 R >>\n");
        writer.Write($"startxref\n{xrefPosition}\n%%EOF");
        writer.Flush();

        return stream.ToArray();
    }

    private static string EscapePdfText(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("(", "\\(", StringComparison.Ordinal)
            .Replace(")", "\\)", StringComparison.Ordinal);
    }

    private sealed class ExportPayload
    {
        public DateTime GeneratedAtUtc { get; init; }
        public string Scope { get; init; } = "all";
        public AgentDto? Agent { get; init; }
        public IReadOnlyCollection<AgentDto> Agents { get; init; } = [];
        public IReadOnlyCollection<CommandDto> Commands { get; init; } = [];
        public IReadOnlyCollection<TaskExecutionDto> Executions { get; init; } = [];
        public ExportAnalyticsPayload Analytics { get; init; } = new();
    }

    private sealed class ExportAnalyticsPayload
    {
        public IReadOnlyCollection<AgentAnalyticsDto> Agents { get; init; } = [];
        public IReadOnlyCollection<CommandAnalyticsDto> Commands { get; init; } = [];
        public IReadOnlyCollection<AgentMetricsDto> AgentMetrics { get; init; } = [];
        public IReadOnlyCollection<AgentRatingDto> AgentRatings { get; init; } = [];
    }
}
