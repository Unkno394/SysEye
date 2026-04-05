using Application.DTO.Analytics;
using Application.Exporters.Interfaces;
using System.Text;
using System.Text.Json;

namespace Application.Exporters;

public class AnalyticsJsonExporter : IAnalyticsJsonExporter
{
    public ExportFileDto Export(AnalyticsFullExportDto data)
    {
        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions
        {
            WriteIndented = true
        });

        return new ExportFileDto
        {
            Content = Encoding.UTF8.GetBytes(json),
            ContentType = "application/json",
            FileName = $"analytics-{DateTime.UtcNow:yyyyMMdd-HHmmss}.json"
        };
    }
}