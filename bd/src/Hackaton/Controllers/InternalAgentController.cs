using Application.DTO;
using Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Web.Contracts.Requests;
using Web.Middlewares;

namespace Web.Controllers;

[ApiController]
[Route("internal/agent")]
[ProducesResponseType(401)]
public class InternalAgentController(IAgentService agentService, ITaskService taskService) : ControllerBase
{
    [HttpPost("register")]
    [Produces(typeof(AgentDto))]
    public async Task<ActionResult<AgentDto>> Register([FromBody] InternalRegisterAgentRequest request, CancellationToken ct)
    {
        if (!TryGetApiKeyUserContext(out var userId, out var apiKeyAgentId, out var apiKeyValue))
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(apiKeyValue))
            return Unauthorized();

        if (apiKeyAgentId.HasValue && request.AgentId.HasValue && request.AgentId.Value != apiKeyAgentId.Value)
            return BadRequest("AgentId в запросе не совпадает с connection token.");

        var agent = await agentService.RegisterInternalAsync(
            userId,
            apiKeyValue,
            request.AgentId ?? apiKeyAgentId,
            request.Name,
            request.IpAddress,
            request.Port,
            request.Os,
            request.Distribution,
            ct);

        return Ok(agent);
    }

    [HttpPost("{id:guid}/heartbeat")]
    [Produces(typeof(DateTime))]
    public async Task<ActionResult<DateTime>> Heartbeat(Guid id, [FromBody] InternalHeartbeatRequest? request, CancellationToken ct)
    {
        if (!TryGetApiKeyUserContext(out var userId, out var apiKeyAgentId, out _))
            return Unauthorized();

        if (apiKeyAgentId != id)
            return Unauthorized();

        var timestamp = await agentService.HeartbeatInternalAsync(
            id,
            userId,
            request?.IpAddress,
            request?.Port,
            request?.Distribution,
            ct);

        return Ok(timestamp);
    }

    [HttpGet("{id:guid}/tasks/next")]
    [Produces(typeof(InternalAgentTaskDto))]
    public async Task<ActionResult<InternalAgentTaskDto>> GetNextTask(Guid id, CancellationToken ct)
    {
        if (!TryGetApiKeyUserContext(out var userId, out var apiKeyAgentId, out _))
            return Unauthorized();

        if (apiKeyAgentId != id)
            return Unauthorized();

        var task = await taskService.GetNextQueuedTaskAsync(id, userId, ct);
        if (task == null)
            return NoContent();

        return Ok(task);
    }

    private bool TryGetApiKeyUserContext(out Guid userId, out Guid? agentId, out string? apiKeyValue)
    {
        if (HttpContext.Items.TryGetValue(ApiKeyMiddleware.ApiKeyUserIdItemKey, out var rawUserId) && rawUserId is Guid parsed)
        {
            userId = parsed;
            agentId = HttpContext.Items.TryGetValue(ApiKeyMiddleware.ApiKeyAgentIdItemKey, out var rawAgentId) && rawAgentId is Guid parsedAgentId
                ? parsedAgentId
                : null;
            apiKeyValue = HttpContext.Items.TryGetValue(ApiKeyMiddleware.ApiKeyValueItemKey, out var rawApiKey)
                ? rawApiKey as string
                : null;
            return true;
        }

        userId = Guid.Empty;
        agentId = null;
        apiKeyValue = null;
        return false;
    }
}
