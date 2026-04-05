using Application.DTO;
using Application.DTO.Agent;
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
public class AgentController(IAgentService agentService) : ControllerBase
{
    /// <summary>
    /// Создаёт нового агента.
    /// </summary>
    [HttpPost]
    [Produces(typeof(Guid))]
    public async Task<ActionResult<Guid>> CreateAgent([FromBody] CreateAgentRequest request, CancellationToken ct)
    {
        var agent = await agentService.Create(
            User.GetUserId(),
            request.Name,
            request.Os,
            request.Tag,
            ct);

        return Ok(agent.Id);
    }

    /// <summary>
    /// Получает информацию об агенте.
    /// </summary>
    [HttpGet("{id:guid}")]
    [Produces(typeof(AgentDto))]
    public async Task<ActionResult<AgentDto?>> GetAgent(Guid id, CancellationToken ct)
    {
        var agent = await agentService.Get(id, User.GetUserId(), ct);

        if (agent == null) return NotFound();

        return Ok(agent);
    }

    /// <summary>
    /// Получает список агентов текущего пользователя.
    /// </summary>
    [HttpGet]
    [Produces(typeof(PagedResult<AgentDto>))]
    public async Task<ActionResult<PagedResult<AgentDto>>> GetUserAgents([FromQuery] PagedRequest request, CancellationToken ct)
    {
        var agents = await agentService.GetUserAgents(User.GetUserId(), request.Take, request.Skip, ct);

        return Ok(agents);
    }

    /// <summary>
    /// Обновляет информацию об агенте.
    /// </summary>
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAgent(Guid id, [FromBody] UpdateAgentRequest request, CancellationToken ct)
    {
        await agentService.Update(
            id,
            User.GetUserId(),
            request.Name,
            request.Os,
            request.Tag,
            ct);

        return Ok();
    }


    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAgent(Guid id, CancellationToken ct)
    {
        await agentService.DeleteAsync(id, User.GetUserId(), ct);

        return Ok();
    }


    [HttpPost("{id:guid}/heartbeat")]
    [Produces(typeof(DateTime))]
    public async Task<ActionResult<DateTime>> Heartbeat(Guid id, CancellationToken ct)
    {
        var timestamp = await agentService.HeartbeatAsync(id, User.GetUserId(), ct);

        return Ok(timestamp);
    }
}