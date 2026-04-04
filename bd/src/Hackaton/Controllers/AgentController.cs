using System.Text;
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
public class AgentController(IAgentService agentService, IApiKeyService apiKeyService, ITaskService taskService) : ControllerBase
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

    [HttpGet("{id}/connection-token")]
    [Produces(typeof(AgentConnectionTokenDto))]
    public async Task<ActionResult<AgentConnectionTokenDto>> GetConnectionToken(Guid id, CancellationToken ct)
    {
        var agent = await agentService.Get(id, User.GetUserId(), ct);

        if (agent == null) return NotFound();

        var apiKey = await apiKeyService.Generate(agent.Id, 3650, ct);
        var payload = new
        {
            v = 1,
            agentId = agent.Id,
            apiKey = apiKey.Value,
        };

        var token = Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));

        return Ok(new AgentConnectionTokenDto
        {
            Token = token,
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
            request.IpAddress,
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

    [HttpPost("{id}/tasks/command")]
    [Produces(typeof(AgentTaskDto))]
    public async Task<ActionResult<AgentTaskDto>> QueueCommand(Guid id, [FromBody] QueueCommandTaskRequest request, CancellationToken ct)
    {
        var task = await taskService.EnqueueCommandAsync(id, User.GetUserId(), request.Title, request.Command, ct);
        return Ok(task);
    }

    [HttpPost("{id}/tasks/scenario/{scenarioId}")]
    [Produces(typeof(List<AgentTaskDto>))]
    public async Task<ActionResult<List<AgentTaskDto>>> QueueScenario(Guid id, Guid scenarioId, CancellationToken ct)
    {
        var tasks = await taskService.EnqueueScenarioAsync(id, User.GetUserId(), scenarioId, ct);
        return Ok(tasks);
    }

    [HttpGet("{id}/tasks")]
    [Produces(typeof(PagedResult<AgentTaskDto>))]
    public async Task<ActionResult<PagedResult<AgentTaskDto>>> GetTasks(Guid id, [FromQuery] PagedRequest request, CancellationToken ct)
    {
        var tasks = await taskService.GetAgentTasksAsync(id, User.GetUserId(), request.Take, request.Skip, ct);
        return Ok(tasks);
    }

    [HttpGet("{id}/metrics")]
    [Produces(typeof(AgentMetricsDto))]
    public async Task<ActionResult<AgentMetricsDto>> GetMetrics(Guid id, CancellationToken ct)
    {
        var metrics = await taskService.GetAgentMetricsAsync(id, User.GetUserId(), ct);
        return Ok(metrics);
    }
}
