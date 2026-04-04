using System.Text;
using System.Text.Json;

namespace Application.Utils;

public sealed record ResolvedConnectionToken(
    string ApiKey,
    Guid? AgentId,
    string? Name);

public static class ConnectionTokenResolver
{
    public static ResolvedConnectionToken Resolve(string? rawValue)
    {
        var value = rawValue?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(value))
            return new ResolvedConnectionToken(string.Empty, null, null);

        try
        {
            var padded = value + new string('=', (4 - value.Length % 4) % 4);
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(padded));
            using var document = JsonDocument.Parse(decoded);
            var root = document.RootElement;

            if (!root.TryGetProperty("apiKey", out var apiKeyElement))
                return new ResolvedConnectionToken(value, null, null);

            var apiKey = apiKeyElement.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(apiKey))
                return new ResolvedConnectionToken(value, null, null);

            Guid? agentId = null;
            if (root.TryGetProperty("agentId", out var agentIdElement)
                && agentIdElement.ValueKind == JsonValueKind.String
                && Guid.TryParse(agentIdElement.GetString(), out var parsedAgentId))
            {
                agentId = parsedAgentId;
            }

            string? name = null;
            if (root.TryGetProperty("name", out var nameElement) && nameElement.ValueKind == JsonValueKind.String)
            {
                name = nameElement.GetString()?.Trim();
            }

            return new ResolvedConnectionToken(apiKey, agentId, string.IsNullOrWhiteSpace(name) ? null : name);
        }
        catch
        {
            return new ResolvedConnectionToken(value, null, null);
        }
    }
}
