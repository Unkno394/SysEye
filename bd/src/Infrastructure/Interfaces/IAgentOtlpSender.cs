using Infrastructure.Dto;

namespace Infrastructure.Interfaces;
public interface IAgentOtlpSender
{
    void Dispose();
    Task SendAsync(string agentId, AgentLogDto log, CancellationToken cancellationToken = default);
}