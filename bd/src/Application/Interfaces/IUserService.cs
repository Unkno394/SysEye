using Application.DTO;

namespace Application.Interfaces
{
    public interface IUserService
    {
        Task<UserInfo?> GetInfo(Guid userId, CancellationToken ct = default);
        Task Rename(Guid userId, string name, CancellationToken ct = default);
    }
}