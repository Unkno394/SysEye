using Application.DTO.Analytics;
using Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Contracts.Requests;
using Web.Extensions;

namespace Web.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
[ProducesResponseType(401)]
public class ExportController(IAnalyticsExportService analyticsExportService) : ControllerBase
{

    /// <summary>
    /// Экспортирует выполненные задачи и аналитику в выбранном формате.
    /// Если ничего не вводить в фильтр, то экспортирует все.
    /// 1) Json — полный экспорт в формате JSON
    /// 2) Csv — табличный экспорт (агенты, команды, выполнения)
    /// 3) Pdf — отчёт с аналитикой и таблицами
    /// </summary>
    /// <param name="format">Формат экспорта</param>
    /// <param name="request">Параметры фильтрации</param>
    [HttpGet]
    [ProducesResponseType(typeof(FileContentResult), 200)]
    [Produces("application/json", "text/csv", "application/pdf")]
    public async Task<IActionResult> Export(
        [FromQuery] AnalyticsExportFormat format,
        [FromQuery] AnalyticsExportRequest request,
        CancellationToken ct)
    {
        var file = await analyticsExportService.ExportAsync(
            User.GetUserId(),
            format,
            request.FromUtc,
            request.ToUtc,
            request.AgentId,
            request.CommandId,
            ct);

        return File(file.Content, file.ContentType, file.FileName);
    }
}