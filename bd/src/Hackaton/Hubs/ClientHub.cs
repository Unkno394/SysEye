using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Web.Extensions;

namespace Web.Hubs;

[Authorize]
public class ClientHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User.GetUserId();

        if (!string.IsNullOrWhiteSpace(userId.ToString()))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GetUserGroup(userId.ToString()));
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User.GetUserId();

        if (!string.IsNullOrWhiteSpace(userId.ToString()))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, GetUserGroup(userId.ToString()));
        }

        await base.OnDisconnectedAsync(exception);
    }

    public static string GetUserGroup(string userId) => $"user-{userId}";
    public static string GetExecutionGroup(Guid executionId) => $"execution-{executionId}";
    public static string GetAgentGroup(string agentId) => $"agent-ui-{agentId}";

    public Task SubscribeExecution(Guid executionId)
        => Groups.AddToGroupAsync(Context.ConnectionId, GetExecutionGroup(executionId));

    public Task UnsubscribeExecution(Guid executionId)
        => Groups.RemoveFromGroupAsync(Context.ConnectionId, GetExecutionGroup(executionId));

    public Task SubscribeAgent(string agentId)
        => Groups.AddToGroupAsync(Context.ConnectionId, GetAgentGroup(agentId));

    public Task UnsubscribeAgent(string agentId)
        => Groups.RemoveFromGroupAsync(Context.ConnectionId, GetAgentGroup(agentId));
}
