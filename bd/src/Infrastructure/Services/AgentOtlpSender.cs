using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Infrastructure.Dto;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace Infrastructure.Services;

public sealed class AgentOtlpSender : IAgentOtlpSender, IDisposable
{
    private readonly HttpClient _httpClient;

    public AgentOtlpSender(IOptions<LokiOptions> options)
    {
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(options.Value.BaseUrl, UriKind.Absolute),
            Timeout = TimeSpan.FromSeconds(options.Value.TimeoutSeconds),
        };
    }

    public async Task SendAsync(
        string agentId,
        AgentLogDto log,
        CancellationToken cancellationToken = default)
    {
        var labels = new Dictionary<string, string>
        {
            ["service_name"] = "agent-signalr-gateway",
            ["agent_id"] = agentId,
            ["severity_text"] = string.IsNullOrWhiteSpace(log.Level) ? "Information" : log.Level,
            ["detected_level"] = MapLevel(log.Level),
        };

        if (log.ExecutionId.HasValue)
            labels["execution_id"] = log.ExecutionId.Value.ToString();

        if (log.CommandId.HasValue)
            labels["command_id"] = log.CommandId.Value.ToString();

        if (!string.IsNullOrWhiteSpace(log.Category))
            labels["log_category"] = log.Category!;

        var payload = new LokiPushRequest
        {
            Streams =
            [
                new LokiStream
                {
                    Stream = labels,
                    Values =
                    [
                        [
                            ToUnixNanoString(log.Timestamp),
                            log.Message ?? string.Empty,
                        ]
                    ]
                }
            ]
        };

        using var response = await _httpClient.PostAsJsonAsync(
            "/loki/api/v1/push",
            payload,
            cancellationToken);

        response.EnsureSuccessStatusCode();
    }

    private static string MapLevel(string? level)
    {
        if (string.IsNullOrWhiteSpace(level))
            return "info";

        return level.Trim().ToLowerInvariant() switch
        {
            "trace" => "trace",
            "debug" => "debug",
            "information" => "info",
            "info" => "info",
            "warning" => "warn",
            "warn" => "warn",
            "error" => "error",
            "critical" => "fatal",
            "fatal" => "fatal",
            _ => "info"
        };
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }

    private static string ToUnixNanoString(DateTimeOffset value)
    {
        var utc = value.ToUniversalTime();
        var seconds = utc.ToUnixTimeSeconds();
        var ticksWithinSecond = utc.Ticks % TimeSpan.TicksPerSecond;
        var nanosWithinSecond = ticksWithinSecond * 100L;

        return (seconds * 1_000_000_000L + nanosWithinSecond).ToString();
    }

    private sealed class LokiPushRequest
    {
        [JsonPropertyName("streams")]
        public List<LokiStream> Streams { get; set; } = [];
    }

    private sealed class LokiStream
    {
        [JsonPropertyName("stream")]
        public Dictionary<string, string> Stream { get; set; } = [];

        [JsonPropertyName("values")]
        public List<List<string>> Values { get; set; } = [];
    }
}
