using Application.DTO;
using Application.Interfaces;
using Domain.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Extensions;

namespace Web.Controllers;

/// <summary>
/// Управления API-ключами для сторонних интеграций.
/// Доступ разрешен только Администраторам
/// </summary>
[Authorize(Roles = nameof(Role.Admin))]
[Route("api/[controller]")]
public class ApiKeyController(IApiKeyService apiKeyService) : ControllerBase
{
    /// <summary>
    /// Генерирует новый API-ключ для текущего пользователя.
    /// Доступ разрешен только Администраторам
    /// </summary>
    /// <param name="name">Название (назначение) API-ключа</param>
    [HttpGet("[action]")]
    [Produces(typeof(ApiKeyDto))]
    public async Task<IActionResult> Generate([FromQuery] string name, CancellationToken ct)
        => Ok(await apiKeyService.Generate(name, User.GetUserId(), ct));

    /// <summary>
    /// Отзывает (удаляет) существующий API-ключ.
    /// Метод всегда возвращает успешный ответ, даже если ключ не существовал.
    /// Это сделано в целях безопасности, чтобы не раскрывать информацию о существовании ключей.
    /// Доступ разрешен только Администраторам.
    /// </summary>
    /// <param name="id">Идентификатор API-ключа для отзыва</param>
    [HttpGet("[action]")]
    public async Task<IActionResult> Revoke([FromQuery] Guid id, CancellationToken ct)
    {
        await apiKeyService.Revoke(id, User.GetUserId(), ct);
        return Ok("Если вы обладали данным ключом, то он отозван");
    }

    /// <summary>
    /// Получает список всех API-ключей текущего пользователя
    /// Доступ разрешен только Администраторам
    /// </summary>
    [HttpGet("[action]")]
    [Produces(typeof(IEnumerable<ApiKeyDto>))]
    public async Task<IActionResult> List(CancellationToken ct)
        => Ok(await apiKeyService.GetKeys(User.GetUserId(), ct));
}
