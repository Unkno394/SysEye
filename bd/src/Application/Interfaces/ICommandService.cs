using Application.DTO;
using Application.DTO.Command;
using Domain.Models;

namespace Application.Interfaces;
public interface ICommandService
{
    Task<CommandPlaceholder> AddPlaceholderAsync(Guid commandId, Guid userId, int index, string name, CancellationToken ct);
    Task<Command> CreateAsync(Guid userId, string? name, string? description, string? bashScript, string? powerShellScript, string? tag, CancellationToken ct);
    Task<bool> DeleteAsync(Guid commandId, Guid userId, CancellationToken ct);
    Task<bool> DeletePlaceholderAsync(Guid commandId, Guid userId, int index, CancellationToken ct);
    Task<List<CommandPlaceholderDto>> GetCommandPlaceholdersAsync(Guid commandId, Guid userId, CancellationToken ct);
    Task<PagedResult<CommandDto>> GetUserCommandsAsync(Guid userId, int take, int skip, CancellationToken ct);
    Task<bool> UpdateAsync(Guid commandId, Guid userId, string? name, string? description, string? bashScript, string? powerShellScript, string? logRegex, string? tag, CancellationToken ct);
    Task<bool> UpdatePlaceholderAsync(Guid commandId, Guid userId, int index, string? name, CancellationToken ct);
}