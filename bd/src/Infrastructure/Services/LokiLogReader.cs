using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Domain.Exceptions;
using Infrastructure.Dto;
using Infrastructure.Interfaces;

namespace Infrastructure.Services;

public class LokiLogReader : ILokiLogReader
{
    private readonly HttpClient _httpClient;

    public LokiLogReader(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByAgentAsync(
        string agentId,
        int limit = 200,
        CancellationToken ct = default)
    {
        var query = "{service_name=\"agent-signalr-gateway\"} " +
            $"| agent_id=\"{EscapeLogQlValue(agentId)}\"";

        return await QueryAsync(query, limit, ct);
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionAsync(
        Guid executionId,
        int limit = 200,
        CancellationToken ct = default)
    {
        var query = "{service_name=\"agent-signalr-gateway\"} " +
            $"| execution_id=\"{EscapeLogQlValue(executionId.ToString())}\"";

        return await QueryAsync(query, limit, ct);
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionRegexAsync(
        Guid executionId,
        string regex,
        int limit = 200,
        CancellationToken ct = default)
    {
        var logs = await GetByExecutionAsync(executionId, limit, ct);

        if (string.IsNullOrWhiteSpace(regex))
            return logs;

        Regex re;
        try
        {
            re = new Regex(regex, RegexOptions.Compiled | RegexOptions.IgnoreCase);
        }
        catch (Exception ex)
        {
            throw new BadRequestException("Некорректный LogRegex у команды.", ex);
        }

        return logs.Where(x => re.IsMatch(x.Message)).ToArray();
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByAgentForExportAsync(
    string agentId,
    DateTimeOffset fromUtc,
    DateTimeOffset toUtc,
    int limit = 100_000,
    CancellationToken ct = default)
    {
        var query = "{service_name=\"agent-signalr-gateway\"} " +
            $"| agent_id=\"{EscapeLogQlValue(agentId)}\"";

        return await QueryForExportAsync(query, fromUtc, toUtc, limit, ct);
    }

    private async Task<IReadOnlyCollection<AgentLogDto>> QueryForExportAsync(
        string query,
        DateTimeOffset fromUtc,
        DateTimeOffset toUtc,
        int limit,
        CancellationToken ct)
    {
        var url = "/loki/api/v1/query_range" +
            $"?query={Uri.EscapeDataString(query)}" +
            $"&start={ToUnixNanoString(fromUtc)}" +
            $"&end={ToUnixNanoString(toUtc)}" +
            $"&limit={limit}" +
            $"&direction=forward";

        using var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var result = new List<AgentLogDto>();

        if (!document.RootElement.TryGetProperty("data", out var data) ||
            !data.TryGetProperty("result", out var results))
        {
            return result;
        }

        foreach (var streamItem in results.EnumerateArray())
        {
            Guid? executionId = null;
            Guid? commandId = null;
            string? category = null;
            string? level = null;

            if (streamItem.TryGetProperty("stream", out var streamProps))
            {
                executionId = TryGetGuid(streamProps, "execution_id");
                commandId = TryGetGuid(streamProps, "command_id");
                category = TryGetString(streamProps, "log_category");
                level = TryGetString(streamProps, "detected_level")
                        ?? TryGetString(streamProps, "severity_text");
            }

            if (!streamItem.TryGetProperty("values", out var values))
                continue;

            foreach (var value in values.EnumerateArray())
            {
                if (value.GetArrayLength() < 2)
                    continue;

                var nanoTs = value[0].GetString() ?? "0";
                var message = value[1].GetString() ?? string.Empty;

                result.Add(new AgentLogDto
                {
                    Timestamp = FromUnixNanoString(nanoTs),
                    Message = message,
                    Level = level,
                    ExecutionId = executionId,
                    CommandId = commandId,
                    Category = category
                });
            }
        }

        return result;
    }

    private async Task<IReadOnlyCollection<AgentLogDto>> QueryAsync(
        string query,
        int limit,
        CancellationToken ct)
    {
        var end = DateTimeOffset.UtcNow;
        var start = end.AddDays(-1);

        var url = "/loki/api/v1/query_range" +
            $"?query={Uri.EscapeDataString(query)}" +
            $"&start={ToUnixNanoString(start)}" +
            $"&end={ToUnixNanoString(end)}" +
            $"&limit={limit}" +
            $"&direction=backward";

        using var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var result = new List<AgentLogDto>();

        if (!document.RootElement.TryGetProperty("data", out var data) ||
            !data.TryGetProperty("result", out var results))
        {
            return result;
        }

        foreach (var streamItem in results.EnumerateArray())
        {
            Guid? agentId = null;
            Guid? executionId = null;
            Guid? commandId = null;
            string? category = null;
            string? level = null;

            if (streamItem.TryGetProperty("stream", out var streamProps))
            {
                agentId = TryGetGuid(streamProps, "agent_id");
                executionId = TryGetGuid(streamProps, "execution_id");
                commandId = TryGetGuid(streamProps, "command_id");
                category = TryGetString(streamProps, "log_category");
                level = TryGetString(streamProps, "detected_level")
                        ?? TryGetString(streamProps, "severity_text");
            }

            if (!streamItem.TryGetProperty("values", out var values))
                continue;

            foreach (var value in values.EnumerateArray())
            {
                if (value.GetArrayLength() < 2)
                    continue;

                var nanoTs = value[0].GetString() ?? "0";
                var message = value[1].GetString() ?? string.Empty;

                result.Add(new AgentLogDto
                {
                    Timestamp = FromUnixNanoString(nanoTs),
                    Message = message,
                    Level = level,
                    ExecutionId = executionId,
                    CommandId = commandId,
                    Category = category
                });
            }
        }

        return result;
    }

    private static string? TryGetString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value)
            ? value.GetString()
            : null;
    }

    private static Guid? TryGetGuid(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
            return null;

        if (value.ValueKind == JsonValueKind.String &&
            Guid.TryParse(value.GetString(), out var guidFromString))
        {
            return guidFromString;
        }

        return null;
    }

    private static string EscapeLogQlValue(string value)
    {
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    private static string ToUnixNanoString(DateTimeOffset value)
    {
        var utc = value.ToUniversalTime();
        var seconds = utc.ToUnixTimeSeconds();
        var ticksWithinSecond = utc.Ticks % TimeSpan.TicksPerSecond;
        var nanosWithinSecond = ticksWithinSecond * 100L;

        return (seconds * 1_000_000_000L + nanosWithinSecond).ToString(CultureInfo.InvariantCulture);
    }

    private static DateTimeOffset FromUnixNanoString(string nanos)
    {
        if (!long.TryParse(nanos, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ns))
            return DateTimeOffset.UtcNow;

        var seconds = ns / 1_000_000_000L;
        var nanosRemainder = ns % 1_000_000_000L;

        return DateTimeOffset
            .FromUnixTimeSeconds(seconds)
            .AddTicks(nanosRemainder / 100L);
    }
}