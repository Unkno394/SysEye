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
        if (!TryGetApiKeyUserId(out var userId))
            return Unauthorized();

        var agent = await agentService.RegisterInternalAsync(
            userId,
            request.AgentId,
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
        if (!TryGetApiKeyUserId(out var userId))
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
        if (!TryGetApiKeyUserId(out var userId))
            return Unauthorized();

        var task = await taskService.GetNextQueuedTaskAsync(id, userId, ct);
        if (task == null)
            return NoContent();

        return Ok(task);
    }

    private bool TryGetApiKeyUserId(out Guid userId)
    {
        if (HttpContext.Items.TryGetValue(ApiKeyMiddleware.ApiKeyUserIdItemKey, out var rawUserId) && rawUserId is Guid parsed)
        {
            userId = parsed;
            return true;
        }

        userId = Guid.Empty;
        return false;
    }
}
