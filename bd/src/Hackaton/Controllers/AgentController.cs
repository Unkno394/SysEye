using System.Text.Json;
using Application.DTO;
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
public class AgentController(IAgentService agentService, IApiKeyService apiKeyService) : ControllerBase
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
            ct);

        return Ok(agent.Id);
    }

    /// <summary>
    /// Создаёт агента и возвращает токен подключения для CLI.
    /// </summary>
    [HttpPost("connection-token")]
    [Produces(typeof(AgentConnectionTokenDto))]
    public async Task<ActionResult<AgentConnectionTokenDto>> CreateConnectionToken([FromBody] CreateAgentRequest request, CancellationToken ct)
    {
        var agent = await agentService.Create(
            User.GetUserId(),
            request.Name,
            request.Os,
            ct);

        var apiKey = await apiKeyService.Generate(agent.Id, 30, ct);
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            agentId = agent.Id,
            apiKey = apiKey.Value,
            name = agent.Name
        });

        return Ok(new AgentConnectionTokenDto
        {
            AgentId = agent.Id,
            Name = agent.Name,
            Token = Convert.ToBase64String(payload),
        });
    }

    /// <summary>
    /// Получает информацию об агенте.
    /// </summary>
    [HttpGet("{id}")]
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
    [HttpPatch("{id}")]
    public async Task<IActionResult> UpdateAgent(Guid id, [FromBody] UpdateAgentRequest request, CancellationToken ct)
    {
        await agentService.Update(
            id,
            User.GetUserId(),
            request.Name,
            request.Os,
            ct);

        return Ok();
    }


    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAgent(Guid id, CancellationToken ct)
    {
        await agentService.DeleteAsync(id, User.GetUserId(), ct);

        return Ok();
    }


    [HttpPost("{id}/heartbeat")]
    [ProducesResponseType(typeof(DateTime), StatusCodes.Status200OK)]
    public async Task<ActionResult<DateTime>> Heartbeat(Guid id, CancellationToken ct)
    {
        var timestamp = await agentService.HeartbeatAsync(id, User.GetUserId(), ct);

        return Ok(timestamp);
    }
}
