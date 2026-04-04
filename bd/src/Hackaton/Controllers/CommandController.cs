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
public class CommandController(ICommandService commandService) : ControllerBase
{
    /// <summary>
    /// Создаёт новую команду для текущего пользователя.
    /// </summary>
    [HttpPost()]
    [Produces(typeof(Guid))]
    public async Task<ActionResult<Guid>> CreateCommand([FromBody] CreateCommandRequest request, CancellationToken ct)
    {
        var command = await commandService.CreateAsync(
            User.GetUserId(),
            request.Name,
            request.Description,
            request.BashScript,
            request.PowerShellScript,
            ct);

        return Ok(command.Id);
    }

    /// <summary>
    /// Обновляет существующую команду.
    /// </summary>
    [HttpPatch("{id}")]
    public async Task<IActionResult> UpdateCommand(Guid id, [FromBody] UpdateCommandRequest request, CancellationToken ct)
    {
        await commandService.UpdateAsync(
            id,
            User.GetUserId(),
            request.Name,
            request.Description,
            request.BashScript,
            request.PowerShellScript,
            ct);

        return Ok();
    }

    /// <summary>
    /// Удаляет команду. Системные команды нельзя удалить.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCommand(Guid id, CancellationToken ct)
    {
        await commandService.DeleteAsync(id, User.GetUserId(), ct);

        return Ok();
    }

    /// <summary>
    /// Добавляет плейсхолдер к команде.
    /// </summary>
    /// <param name="commandId">ID команды</param>
    [HttpPost("{commandId}/placeholders")]
    [ProducesResponseType(typeof(Guid), StatusCodes.Status200OK)]
    public async Task<ActionResult<Guid>> AddPlaceholder(Guid commandId, [FromBody] AddPlaceholderRequest request, CancellationToken ct)
    {
        var placeholder = await commandService.AddPlaceholderAsync(
            commandId,
            User.GetUserId(),
            request.Index,
            request.Name,
            ct);

        return Ok(placeholder.Id);
    }

    /// <summary>
    /// Получает список команд текущего пользователя.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<object>>> GetUserCommands([FromQuery] PagedRequest request, CancellationToken ct)
    {
        var commands = await commandService.GetUserCommandsAsync(User.GetUserId(), request.Take, request.Skip, ct);

        return Ok(commands);
    }

    /// <summary>
    /// Получает список плейсхолдеров команды.
    /// </summary>
    /// <param name="commandId">ID команды</param>
    [HttpGet("{commandId}/placeholders")]
    public async Task<ActionResult<IEnumerable<object>>> GetCommandPlaceholders(Guid commandId, CancellationToken ct)
    {
        var placeholders = await commandService.GetCommandPlaceholdersAsync(commandId, User.GetUserId(), ct);

        return Ok(placeholders);
    }

    /// <summary>
    /// Обновляет существующий плейсхолдер команды.
    /// </summary>
    /// <param name="commandId">ID команды</param>
    /// <param name="index">Индекс плейсхолдера </param>
    [HttpPatch("{commandId}/placeholders/{index}")]
    public async Task<IActionResult> UpdatePlaceholder(
        Guid commandId,
        int index,
        [FromBody] UpdatePlaceholderRequest request,
        CancellationToken ct)
    {
        await commandService.UpdatePlaceholderAsync(
            commandId,
            User.GetUserId(),
            index,
            request.Name,
            ct);

        return Ok();
    }

    /// <summary>
    /// Удаляет плейсхолдер команды.
    /// </summary>
    /// <param name="commandId">ID команды</param>
    /// <param name="index">Индекс плейсхолдера (например, 1 для $1)</param>
    [HttpDelete("{commandId}/placeholders/{index}")]
    public async Task<IActionResult> DeletePlaceholder(Guid commandId, int index, CancellationToken ct)
    {
        await commandService.DeletePlaceholderAsync(
            commandId,
            User.GetUserId(),
            index,
            ct);

        return Ok();
    }
}