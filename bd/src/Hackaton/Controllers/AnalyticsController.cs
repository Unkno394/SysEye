using Application.DTO;
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
    [HttpGet("agents")]
    [Produces(typeof(IReadOnlyCollection<AgentAnalyticsDto>))]
    public async Task<ActionResult<IReadOnlyCollection<AgentAnalyticsDto>>> GetAgents(CancellationToken cancellationToken)
    {
        var analytics = await analyticsService.GetAgentsAnalyticsAsync(User.GetUserId(), cancellationToken);
        return Ok(analytics);
    }

    [HttpGet("agents/{agentId:guid}")]
    [Produces(typeof(AgentAnalyticsDto))]
    public async Task<ActionResult<AgentAnalyticsDto>> GetAgent(Guid agentId, CancellationToken cancellationToken)
    {
        var analytics = await analyticsService.GetAgentAnalyticsAsync(User.GetUserId(), agentId, cancellationToken);
        return Ok(analytics);
    }

    [HttpGet("agents/{agentId:guid}/metrics")]
    [Produces(typeof(AgentMetricsDto))]
    public async Task<ActionResult<AgentMetricsDto>> GetAgentMetrics(Guid agentId, CancellationToken cancellationToken)
    {
        var metrics = await analyticsService.GetAgentMetricsAsync(User.GetUserId(), agentId, cancellationToken);
        return Ok(metrics);
    }

    [HttpGet("agents/ratings")]
    [Produces(typeof(IReadOnlyCollection<AgentRatingDto>))]
    public async Task<ActionResult<IReadOnlyCollection<AgentRatingDto>>> GetAgentRatings(CancellationToken cancellationToken)
    {
        var ratings = await analyticsService.GetAgentRatingsAsync(User.GetUserId(), cancellationToken);
        return Ok(ratings);
    }

    [HttpGet("commands")]
    [Produces(typeof(IReadOnlyCollection<CommandAnalyticsDto>))]
    public async Task<ActionResult<IReadOnlyCollection<CommandAnalyticsDto>>> GetCommands(CancellationToken cancellationToken)
    {
        var analytics = await analyticsService.GetCommandsAnalyticsAsync(User.GetUserId(), cancellationToken);
        return Ok(analytics);
    }

    [HttpGet("commands/{commandId:guid}")]
    [Produces(typeof(CommandAnalyticsDto))]
    public async Task<ActionResult<CommandAnalyticsDto>> GetCommand(Guid commandId, CancellationToken cancellationToken)
    {
        var analytics = await analyticsService.GetCommandAnalyticsAsync(User.GetUserId(), commandId, cancellationToken);
        return Ok(analytics);
    }
}
