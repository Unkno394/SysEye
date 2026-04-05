using Application.DTO.Analytics;
using Application.Exporters.Interfaces;
using System.Globalization;
using System.Text;

namespace Application.Exporters;

public class AnalyticsCsvExporter : IAnalyticsCsvExporter
{
    public ExportFileDto Export(AnalyticsFullExportDto data)
    {
        var sb = new StringBuilder();

        sb.AppendLine("Agent analytics");
        sb.AppendLine("AgentId,AgentName,Executions,Errors,SuccessRate,AverageDurationSeconds,MinDurationSeconds,MaxDurationSeconds");

        foreach (var item in data.AgentAnalytics)
        {
            sb.AppendLine(string.Join(",",
                Escape(item.AgentId.ToString()),
                Escape(item.AgentName),
                Escape(item.Total.Executions.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.Errors.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.SuccessRate.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.AverageDurationSeconds.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.MinDurationSeconds.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.MaxDurationSeconds.ToString(CultureInfo.InvariantCulture))
            ));
        }

        sb.AppendLine();
        sb.AppendLine("Command analytics");
        sb.AppendLine("CommandId,CommandName,Executions,Errors,SuccessRate,AverageDurationSeconds,MinDurationSeconds,MaxDurationSeconds");

        foreach (var item in data.CommandAnalytics)
        {
            sb.AppendLine(string.Join(",",
                Escape(item.CommandId.ToString()),
                Escape(item.CommandName),
                Escape(item.Total.Executions.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.Errors.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.SuccessRate.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.AverageDurationSeconds.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.MinDurationSeconds.ToString(CultureInfo.InvariantCulture)),
                Escape(item.Total.MaxDurationSeconds.ToString(CultureInfo.InvariantCulture))
            ));
        }

        sb.AppendLine();
        sb.AppendLine("Task executions");
        sb.AppendLine("Id,CommandId,AgentId,StartedAt,DurationSeconds,IsSuccess");

        foreach (var item in data.TaskExecutions)
        {
            sb.AppendLine(string.Join(",",
                Escape(item.Id.ToString()),
                Escape(item.CommandId.ToString()),
                Escape(item.AgentId.ToString()),
                Escape(item.StartedAt.ToString("O", CultureInfo.InvariantCulture)),
                Escape(item.DurationSeconds.ToString(CultureInfo.InvariantCulture)),
                Escape(item.IsSuccess.ToString())
            ));
        }

        return new ExportFileDto
        {
            Content = Encoding.UTF8.GetBytes(sb.ToString()),
            ContentType = "text/csv",
            FileName = $"analytics-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv"
        };
    }

    private static string Escape(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r'))
            return $"\"{value.Replace("\"", "\"\"")}\"";

        return value;
    }
}