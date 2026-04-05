using Infrastructure.Extensions;
using Infrastructure.Dto;
using Grpc.Net.Client;
using Infrastructure.Interfaces;
using OpenTelemetry.Proto.Common.V1;
using OpenTelemetry.Proto.Collector.Logs.V1;
using OpenTelemetry.Proto.Logs.V1;
using OpenTelemetry.Proto.Resource.V1;
using Microsoft.Extensions.Options;
using Infrastructure.Options;

namespace Infrastructure.Services;

public class AgentOtlpSender : IAgentOtlpSender, IDisposable
{
    private readonly GrpcChannel _channel;
    private readonly LogsService.LogsServiceClient _client;

    public AgentOtlpSender(IOptions<OpenTelemetryOptions> options)
    {
        _channel = GrpcChannel.ForAddress(options.Value.Endpoint);
        _client = new LogsService.LogsServiceClient(_channel);
    }

    public async Task SendAsync(
        string agentId,
        AgentLogDto log,
        CancellationToken cancellationToken = default)
    {
        var request = new ExportLogsServiceRequest();

        var resourceLogs = new ResourceLogs
        {
            Resource = new Resource()
        };

        resourceLogs.Resource.Attributes.Add(new KeyValue
        {
            Key = "service.name",
            Value = new AnyValue { StringValue = "agent-signalr-gateway" }
        });

        resourceLogs.Resource.Attributes.Add(new KeyValue
        {
            Key = "log.source",
            Value = new AnyValue { StringValue = "signalr-agent" }
        });

        var scopeLogs = new ScopeLogs();

        var record = new LogRecord
        {
            Body = new AnyValue
            {
                StringValue = log.Message ?? string.Empty
            },
            SeverityNumber = MapSeverity(log.Level),
            SeverityText = string.IsNullOrWhiteSpace(log.Level) ? "Information" : log.Level,
            TimeUnixNano = log.Timestamp.ToUnixNano(),
            ObservedTimeUnixNano = DateTimeOffset.UtcNow.ToUnixNano()
        };

        record.Attributes.Add(new KeyValue
        {
            Key = "agent.id",
            Value = new AnyValue { StringValue = agentId }
        });

        record.Attributes.Add(new KeyValue
        {
            Key = "execution.id",
            Value = new AnyValue { StringValue = log.ExecutionId.ToString() }
        });

        if (log.CommandId.HasValue)
        {
            record.Attributes.Add(new KeyValue
            {
                Key = "command.id",
                Value = new AnyValue { StringValue = log.CommandId.Value.ToString() }
            });
        }

        if (string.IsNullOrEmpty(log.Category))
        {
            record.Attributes.Add(new KeyValue
            {
                Key = "category",
                Value = new AnyValue { StringValue = log.CommandId.Value.ToString() }
            });
        }

        scopeLogs.LogRecords.Add(record);
        resourceLogs.ScopeLogs.Add(scopeLogs);
        request.ResourceLogs.Add(resourceLogs);

        await _client.ExportAsync(request, cancellationToken: cancellationToken)
            .ResponseAsync
            .ConfigureAwait(false);
    }

    private static SeverityNumber MapSeverity(string? level)
    {
        if (string.IsNullOrWhiteSpace(level))
            return SeverityNumber.Info;

        return level.Trim().ToLowerInvariant() switch
        {
            "trace" => SeverityNumber.Trace,
            "debug" => SeverityNumber.Debug,
            "information" => SeverityNumber.Info,
            "info" => SeverityNumber.Info,
            "warning" => SeverityNumber.Warn,
            "warn" => SeverityNumber.Warn,
            "error" => SeverityNumber.Error,
            "critical" => SeverityNumber.Fatal,
            "fatal" => SeverityNumber.Fatal,
            _ => SeverityNumber.Info
        };
    }

    public void Dispose()
    {
        _channel.Dispose();
    }
}