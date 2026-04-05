using Application.DTO.Analytics;

namespace Application.Exporters.Interfaces;
public interface IAnalyticsJsonExporter
{
    ExportFileDto Export(AnalyticsFullExportDto data);
}