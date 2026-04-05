using Application.DTO.Analytics;

namespace Application.Exporters.Interfaces;
public interface IAnalyticsCsvExporter
{
    ExportFileDto Export(AnalyticsFullExportDto data);
}