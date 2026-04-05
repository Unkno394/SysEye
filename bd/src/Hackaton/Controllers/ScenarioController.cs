using Application.DTO;
using Application.DTO.Scenario;
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
public class ScenarioController(IScenarioService scenarioService) : ControllerBase
{
    /// <summary>
    /// Создаёт новый сценарий для текущего пользователя.
    /// </summary>
    [HttpPost]
    [Produces(typeof(Guid))]
    public async Task<ActionResult<Guid>> CreateScenario(
        [FromBody] CreateScenarioRequest request,
        CancellationToken ct)
    {
        var scenario = await scenarioService.CreateAsync(
            User.GetUserId(),
            request.Name,
            request.Description,
            ct);

        return Ok(scenario.Id);
    }

    /// <summary>
    /// Обновляет сценарий.
    /// </summary>
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateScenario(
        Guid id,
        [FromBody] UpdateScenarioRequest request,
        CancellationToken ct)
    {
        await scenarioService.UpdateAsync(
            id,
            User.GetUserId(),
            request.Name,
            request.Description,
            ct);

        return Ok();
    }

    /// <summary>
    /// Удаляет сценарий.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteScenario(Guid id, CancellationToken ct)
    {
        await scenarioService.DeleteAsync(id, User.GetUserId(), ct);
        return Ok();
    }

    /// <summary>
    /// Получает список сценариев текущего пользователя.
    /// </summary>
    [HttpGet]
    [Produces(typeof(PagedResult<ScenarioDto>))]
    public async Task<ActionResult<PagedResult<ScenarioDto>>> GetUserScenarios(
        [FromQuery] PagedRequest request,
        CancellationToken ct)
    {
        var scenarios = await scenarioService.GetUserScenariosAsync(
            User.GetUserId(),
            request.Take,
            request.Skip,
            ct);

        return Ok(scenarios);
    }

    /// <summary>
    /// Получает сценарий с командами.
    /// </summary>
    [HttpGet("{id:guid}")]
    [Produces(typeof(ScenarioDetailsDto))]
    public async Task<ActionResult<ScenarioDetailsDto>> GetScenarioById(Guid id, CancellationToken ct)
    {
        var scenario = await scenarioService.GetByIdAsync(id, User.GetUserId(), ct);
        return Ok(scenario);
    }

    /// <summary>
    /// Добавляет команду в сценарий.
    /// </summary>
    [HttpPost("{scenarioId:guid}/commands")]
    [Produces(typeof(Guid))]
    public async Task<ActionResult<Guid>> AddCommand(
        Guid scenarioId,
        [FromBody] AddScenarioCommandRequest request,
        CancellationToken ct)
    {
        var scenarioCommandId = await scenarioService.AddCommandAsync(
            scenarioId,
            User.GetUserId(),
            request.CommandId,
            request.Order,
            ct);

        return Ok(scenarioCommandId);
    }

    /// <summary>
    /// Обновляет порядок команды в сценарии.
    /// </summary>
    [HttpPatch("{scenarioId:guid}/commands/{commandId:guid}")]
    public async Task<IActionResult> UpdateCommandOrder(
        Guid scenarioId,
        Guid commandId,
        [FromQuery] int order,
        CancellationToken ct)
    {
        await scenarioService.UpdateCommandOrderAsync(
            scenarioId,
            User.GetUserId(),
            commandId,
            order,
            ct);

        return Ok();
    }

    /// <summary>
    /// Удаляет команду из сценария.
    /// </summary>
    [HttpDelete("{scenarioId:guid}/commands/{commandId:guid}")]
    public async Task<IActionResult> RemoveCommand(
        Guid scenarioId,
        Guid commandId,
        CancellationToken ct)
    {
        await scenarioService.RemoveCommandAsync(
            scenarioId,
            User.GetUserId(),
            commandId,
            ct);

        return Ok();
    }
}