using Application.DTO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Contracts.Requests;
using Web.Extensions;

namespace Web.Controllers;

[Authorize]
[ApiController]
[Route("[controller]")]
public class TaskController(
    ITaskService taskService,
    ILogger<TaskController> logger) : ControllerBase
{
    /// <summary>
    /// Запускает выполнение команды на указанном агенте.
    /// </summary>
    /// <param name="agentId">Идентификатор агента.</param>
    /// <param name="request">Данные для выполнения команды.</param>
    [Produces(typeof(Guid))]
    [HttpPost("agents/{agentId:guid}/execute")]
    public async Task<IActionResult> ExecuteCommand(
        [FromRoute] Guid agentId,
        [FromBody] ExecuteCommandRequest request,
        CancellationToken cancellationToken)
    {
        var executionId = await taskService.ExecuteCommand(
            User.GetUserId(),
            agentId,
            request,
            cancellationToken);

        return Ok(executionId);
    }

    /// <summary>
    /// Запускает выполнение сценария на указанном агенте.
    /// </summary>
    /// <param name="agentId">Идентификатор агента.</param>
    /// <param name="request">Данные для выполнения команды.</param>
    [Produces(typeof(Guid))]
    [HttpPost("agents/{agentId:guid}/scenario")]
    public async Task<IActionResult> ExecuteScenario(
        [FromRoute] Guid agentId,
        [FromBody] ExecuteScenarioRequest request,
        CancellationToken cancellationToken)
    {
        var executionId = await taskService.ExecuteScenario(User.GetUserId(),
            agentId,
            request.ScenarioId,
            request.Commands,
            cancellationToken);

        return Ok(executionId);
    }

    /// <summary>
    /// Возвращает список выполнений команд для указанного агента.
    /// </summary>
    /// <param name="agentId">Идентификатор агента.</param>
    /// <param name="request">Параметры пагинации.</param>
    [HttpGet("agents/{agentId:guid}")]
    [Produces(typeof(PagedResult<TaskExecutionDto>))]
    public async Task<ActionResult<TaskExecutionDto>> GetByAgent([FromRoute] Guid agentId,
        [FromQuery] PagedRequest request,
        CancellationToken cancellationToken)
    {
        var tasks = await taskService.GetTasksByAgent(
            User.GetUserId(),
            agentId,
            request.Take,
            request.Skip,
            cancellationToken);

        return Ok(tasks);
    }

    /// <summary>
    /// Возвращает список всех выполнений команд текущего пользователя.
    /// </summary>
    /// <param name="request">Параметры пагинации.</param>
    /// <param name="cancellationToken">Токен отмены.</param>
    [HttpGet()]
    [Produces(typeof(PagedResult<TaskExecutionDto>))]
    public async Task<ActionResult<TaskExecutionDto>> GetByUser(
        [FromQuery] PagedRequest request,
        CancellationToken cancellationToken)
    {
        var tasks = await taskService.GetTasksByUser(
            User.GetUserId(),
            request.Take,
            request.Skip,
            cancellationToken);

        return Ok(tasks);
    }
}