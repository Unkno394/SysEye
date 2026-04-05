using Application.Interfaces;
using Infrastructure.Dto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Extensions;

namespace Web.Controllers;

[Authorize]
[ApiController]
[Route("api/logs")]
[ProducesResponseType(401)]
public class LogsController(
    IAgentLogsService agentLogsService) : ControllerBase
{

    /// <summary>
    /// Возвращает последние логи указанного агента.
    /// </summary>
    /// <param name="agentId">Идентификатор агента.</param>
    /// <param name="limit">Максимальное количество логов (по умолчанию 200).</param>
    [HttpGet("agents/{agentId:guid}")]
    public async Task<ActionResult<IReadOnlyCollection<AgentLogDto>>> GetByAgent(
        Guid agentId,
        [FromQuery] int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var logs = await agentLogsService.GetByAgentAsync(
            User.GetUserId(),
            agentId,
            limit,
            cancellationToken);

        return Ok(logs);
    }

    /// <summary>
    /// Возвращает логи конкретного выполнения команды.
    /// </summary>
    /// <param name="executionId">Идентификатор выполнения.</param>
    /// <param name="limit">Максимальное количество логов (по умолчанию 200).</param>
    [HttpGet("executions/{executionId:guid}")]
    public async Task<ActionResult<IReadOnlyCollection<AgentLogDto>>> GetByExecution(
        Guid executionId,
        [FromQuery] int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var logs = await agentLogsService.GetByExecutionAsync(
            User.GetUserId(),
            executionId,
            limit,
            cancellationToken);

        return Ok(logs);
    }

    /// <summary>
    /// Возвращает логи выполнения команды, отфильтрованные по регулярному выражению,
    /// заданному в настройках команды.
    /// </summary>
    /// <param name="executionId">Идентификатор выполнения.</param>
    /// <param name="limit">Максимальное количество логов (по умолчанию 200).</param>
    [HttpGet("executions/{executionId:guid}/regex")]
    public async Task<ActionResult<IReadOnlyCollection<AgentLogDto>>> GetByExecutionRegex(
        Guid executionId,
        [FromQuery] int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var logs = await agentLogsService.GetByExecutionRegexAsync(
            User.GetUserId(),
            executionId,
            limit,
            cancellationToken);

        return Ok(logs);
    }
}
