using Application.DTO.Analytics;
using Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Extensions;

namespace Web.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
[ProducesResponseType(401)]
public class AnalyticsController(IAnalyticsService analyticsService) : ControllerBase
{
    /// <summary>
    /// Получает аналитику по всем агентам пользователя
    /// </summary>
    [HttpGet("agents")]
    [Produces(typeof(IReadOnlyCollection<AgentAnalyticsDto>))]
    public async Task<ActionResult<IReadOnlyCollection<AgentAnalyticsDto>>> GetAgents(CancellationToken ct)
    {
        var result = await analyticsService.GetAgentAnalytics(User.GetUserId(), ct);
        return Ok(result);
    }

    /// <summary>
    /// Получает аналитику по конкретному агенту
    /// </summary>
    /// <param name="agentId">Идентификатор агента</param>
    [HttpGet("agents/{agentId:guid}")]
    [Produces(typeof(AgentAnalyticsDto))]
    public async Task<ActionResult<AgentAnalyticsDto>> GetAgent(Guid agentId, CancellationToken ct)
    {
        var result = await analyticsService.GetAgentAnalyticsById(User.GetUserId(), agentId, ct);
        return Ok(result);
    }

    /// <summary>
    /// Получает аналитику по всем командам пользователя
    /// </summary>
    [HttpGet("commands")]
    [Produces(typeof(IReadOnlyCollection<CommandAnalyticsDto>))]
    public async Task<ActionResult<IReadOnlyCollection<CommandAnalyticsDto>>> GetCommands(CancellationToken ct)
    {
        var result = await analyticsService.GetCommandAnalytics(User.GetUserId(), ct);
        return Ok(result);
    }

    /// <summary>
    /// Получает аналитику по конкретной команде
    /// </summary>
    /// <param name="commandId">Идентификатор команды</param>
    [HttpGet("commands/{commandId:guid}")]
    [Produces(typeof(CommandAnalyticsDto))]
    public async Task<ActionResult<CommandAnalyticsDto>> GetCommand(Guid commandId, CancellationToken ct)
    {
        var result = await analyticsService.GetCommandAnalyticsById(User.GetUserId(), commandId, ct);
        return Ok(result);
    }
}