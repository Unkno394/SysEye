using Application.DTO;
using Domain.Models;

namespace Application.Interfaces;
public interface IScenarioService
{
    Task<Guid> AddCommandAsync(Guid scenarioId, Guid userId, Guid commandId, int order, CancellationToken ct);
    Task<Scenario> CreateAsync(Guid userId, string name, string description, CancellationToken ct);
    Task<bool> DeleteAsync(Guid scenarioId, Guid userId, CancellationToken ct);
    Task<ScenarioDetailsDto> GetByIdAsync(Guid scenarioId, Guid userId, CancellationToken ct);
    Task<PagedResult<ScenarioDto>> GetUserScenariosAsync(Guid userId, int take, int skip, CancellationToken ct);
    Task<bool> RemoveCommandAsync(Guid scenarioId, Guid userId, Guid commandId, CancellationToken ct);
    Task<bool> UpdateAsync(Guid scenarioId, Guid userId, string? name, string? description, CancellationToken ct);
    Task<bool> UpdateCommandOrderAsync(Guid scenarioId, Guid userId, Guid commandId, int order, CancellationToken ct);
}