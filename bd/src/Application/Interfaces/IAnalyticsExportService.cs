using Application.DTO.Analytics;

namespace Application.Interfaces;
public interface IAnalyticsExportService
{
    Task<ExportFileDto> ExportAsync(Guid userId, AnalyticsExportFormat format, DateTime? fromUtc = null, DateTime? toUtc = null, Guid? agentId = null, Guid? commandId = null, CancellationToken ct = default);
    Task<AnalyticsFullExportDto> GetFullExportAsync(Guid userId, DateTime? fromUtc = null, DateTime? toUtc = null, Guid? agentId = null, Guid? commandId = null, CancellationToken ct = default);
}