using Application.DTO.Analytics;

namespace Application.Exporters.Interfaces;
public interface IAnalyticsPdfExporter
{
    ExportFileDto Export(AnalyticsFullExportDto data);
}