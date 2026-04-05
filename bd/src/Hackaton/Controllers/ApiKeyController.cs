using Application.DTO.ApiKey;
using Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Web.Contracts.Requests;
using Web.Extensions;

namespace Web.Controllers;

[Route("[controller]")]
public class ApiKeyController(IApiKeyService apiKeyService) : ControllerBase
{
    /// <summary>
    /// Генерирует новый API-ключ для агента.
    /// </summary>
    /// <param name="name">Название (назначение) API-ключа</param>
    [HttpGet("[action]")]
    [Produces(typeof(ApiKeyDto))]
    public async Task<IActionResult> Generate([FromQuery] GenerateApiKeyRequest request, CancellationToken ct)
        => Ok(await apiKeyService.Generate(request.AgentId, request.DaysToRevoke, ct));

    /// <summary>
    /// Метод всегда возвращает успешный ответ, даже если ключ не существовал.
    /// </summary>
    [HttpPost("[action]")]
    public async Task<IActionResult> Revoke([FromBody] ApiKeyRevokeRequest request, CancellationToken ct)
    {
        await apiKeyService.Revoke(request.ApiKeyId, request.AgentId, ct);
        return Ok("Если вы обладали данным ключом, то он отозван");
    }

    /// <summary>
    /// Информация о API-ключе агента
    /// </summary>
    [HttpGet("[action]")]
    [Produces(typeof(IEnumerable<ApiKeyDto>))]
    public async Task<IActionResult> Info([FromQuery] Guid AgentId,CancellationToken ct)
        => Ok(await apiKeyService.GetKey(User.GetUserId(), ct));
}