using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class AnalyticsService(AppDbContext dbContext) : IAnalyticsService
{
    public async Task<IReadOnlyCollection<AgentAnalyticsDto>> GetAgentsAnalyticsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var snapshots = await LoadAgentSnapshotsAsync(userId, cancellationToken);

        return snapshots
            .Select(snapshot => new AgentAnalyticsDto
            {
                AgentId = snapshot.AgentId,
                AgentName = snapshot.AgentName,
                Total = BuildAnalytics(snapshot.Tasks),
                Today = BuildAnalytics(FilterToday(snapshot.Tasks)),
            })
            .OrderByDescending(x => x.Total?.Executions ?? 0)
            .ThenBy(x => x.AgentName)
            .ToArray();
    }

    public async Task<AgentAnalyticsDto> GetAgentAnalyticsAsync(Guid userId, Guid agentId, CancellationToken cancellationToken = default)
    {
        var snapshot = await LoadAgentSnapshotAsync(userId, agentId, cancellationToken);

        return new AgentAnalyticsDto
        {
            AgentId = snapshot.AgentId,
            AgentName = snapshot.AgentName,
            Total = BuildAnalytics(snapshot.Tasks),
            Today = BuildAnalytics(FilterToday(snapshot.Tasks)),
        };
    }

    public async Task<IReadOnlyCollection<CommandAnalyticsDto>> GetCommandsAnalyticsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var snapshots = await LoadCommandSnapshotsAsync(userId, cancellationToken);

        return snapshots
            .Select(snapshot => new CommandAnalyticsDto
            {
                CommandId = snapshot.CommandId,
                CommandName = snapshot.CommandName,
                Total = BuildAnalytics(snapshot.Tasks),
                Today = BuildAnalytics(FilterToday(snapshot.Tasks)),
            })
            .OrderByDescending(x => x.Total?.Executions ?? 0)
            .ThenBy(x => x.CommandName)
            .ToArray();
    }

    public async Task<CommandAnalyticsDto> GetCommandAnalyticsAsync(Guid userId, Guid commandId, CancellationToken cancellationToken = default)
    {
        var snapshot = await LoadCommandSnapshotAsync(userId, commandId, cancellationToken);

        return new CommandAnalyticsDto
        {
            CommandId = snapshot.CommandId,
            CommandName = snapshot.CommandName,
            Total = BuildAnalytics(snapshot.Tasks),
            Today = BuildAnalytics(FilterToday(snapshot.Tasks)),
        };
    }

    public async Task<AgentMetricsDto> GetAgentMetricsAsync(Guid userId, Guid agentId, CancellationToken cancellationToken = default)
    {
        var snapshot = await LoadAgentSnapshotAsync(userId, agentId, cancellationToken);
        var tasks = snapshot.Tasks;
        var completed = tasks.Where(IsCompletedTask).ToArray();
        var today = FilterToday(tasks).ToArray();
        var last7Days = Enumerable.Range(0, 7)
            .Select(offset => DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(-6 + offset)))
            .ToArray();

        return new AgentMetricsDto
        {
            AgentId = snapshot.AgentId,
            TotalRuns = tasks.Length,
            SuccessfulRuns = tasks.Count(task => NormalizeStatus(task.Status) == "success"),
            FailedRuns = tasks.Count(task => IsFailureStatus(task.Status)),
            RunningRuns = tasks.Count(task => NormalizeStatus(task.Status) == "running"),
            QueuedRuns = tasks.Count(task => NormalizeStatus(task.Status) is "queued" or "sent"),
            RunsToday = today.Length,
            ErrorsToday = today.Count(task => IsFailureStatus(task.Status)),
            AverageDurationSeconds = completed.Any() ? completed.Average(GetDurationSeconds) : 0,
            SuccessRate = CalculateSuccessRate(tasks),
            Activity = last7Days
                .Select(day =>
                {
                    var dayTasks = tasks.Where(task => DateOnly.FromDateTime(GetTaskDate(task)) == day).ToArray();
                    var dayCompleted = dayTasks.Where(IsCompletedTask).ToArray();

                    return new AgentMetricsPointDto
                    {
                        Date = DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc),
                        TotalRuns = dayTasks.Length,
                        SuccessRuns = dayTasks.Count(task => NormalizeStatus(task.Status) == "success"),
                        ErrorRuns = dayTasks.Count(task => IsFailureStatus(task.Status)),
                        AverageDurationSeconds = dayCompleted.Any() ? dayCompleted.Average(GetDurationSeconds) : 0,
                    };
                })
                .ToList(),
        };
    }

    public async Task<IReadOnlyCollection<AgentRatingDto>> GetAgentRatingsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var snapshots = await LoadAgentSnapshotsAsync(userId, cancellationToken);
        var completedAverages = snapshots
            .Select(snapshot => snapshot.Tasks.Where(IsCompletedTask).Select(GetDurationSeconds).DefaultIfEmpty(0).Average())
            .Where(value => value > 0)
            .ToArray();
        var globalAverageDuration = completedAverages.Any() ? completedAverages.Average() : 0;

        var ratings = snapshots
            .Select(snapshot =>
            {
                var tasks = snapshot.Tasks;
                var completed = tasks.Where(IsCompletedTask).ToArray();
                var averageDuration = completed.Any() ? completed.Average(GetDurationSeconds) : 0;
                var successRate = CalculateSuccessRate(tasks);
                var errorsToday = FilterToday(tasks).Count(task => IsFailureStatus(task.Status));
                var stabilityScore = Math.Round(successRate, 2);
                var speedScore = CalculateSpeedScore(averageDuration, globalAverageDuration);
                var overallScore = Math.Round((stabilityScore * 0.7) + (speedScore * 0.3), 2);

                return new AgentRatingDto
                {
                    AgentId = snapshot.AgentId,
                    AgentName = snapshot.AgentName,
                    IpAddress = snapshot.IpAddress,
                    Os = snapshot.Os,
                    Distribution = snapshot.Distribution,
                    LastHeartbeatAt = snapshot.LastHeartbeatAt,
                    TotalRuns = tasks.Length,
                    ErrorsToday = errorsToday,
                    AverageDurationSeconds = averageDuration,
                    SuccessRate = successRate,
                    StabilityScore = stabilityScore,
                    SpeedScore = speedScore,
                    OverallScore = overallScore,
                };
            })
            .OrderByDescending(item => item.OverallScore)
            .ThenByDescending(item => item.StabilityScore)
            .ThenBy(item => item.AverageDurationSeconds)
            .ThenBy(item => item.AgentName)
            .ToList();

        for (var index = 0; index < ratings.Count; index++)
        {
            ratings[index].Rank = index + 1;
        }

        return ratings;
    }

    private async Task<IReadOnlyCollection<AgentSnapshot>> LoadAgentSnapshotsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var agents = await dbContext.Agents.AsNoTracking()
            .Where(agent => agent.UserId == userId && !agent.IsDeleted)
            .Select(agent => new AgentSnapshot
            {
                AgentId = agent.Id,
                AgentName = agent.Name,
                IpAddress = agent.IpAddress,
                Os = agent.Os,
                Distribution = agent.Distribution,
                LastHeartbeatAt = agent.LastHeartbeatAt,
            })
            .ToListAsync(cancellationToken);

        var tasks = await dbContext.AgentTasks.AsNoTracking()
            .Where(task => task.UserId == userId && !task.IsDeleted)
            .Select(task => new TaskSnapshot
            {
                AgentId = task.AgentId,
                CommandId = task.CommandId,
                CreatedAt = task.CreatedAt,
                StartedAt = task.StartedAt,
                FinishedAt = task.FinishedAt,
                Status = task.Status,
            })
            .ToListAsync(cancellationToken);

        var tasksByAgent = tasks.GroupBy(task => task.AgentId).ToDictionary(group => group.Key, group => group.ToArray());
        foreach (var agent in agents)
        {
            agent.Tasks = tasksByAgent.TryGetValue(agent.AgentId, out var grouped) ? grouped : [];
        }

        return agents;
    }

    private async Task<AgentSnapshot> LoadAgentSnapshotAsync(Guid userId, Guid agentId, CancellationToken cancellationToken)
    {
        var snapshot = (await LoadAgentSnapshotsAsync(userId, cancellationToken)).FirstOrDefault(item => item.AgentId == agentId);
        if (snapshot is null)
            throw new NotFoundException("Агент не найден");

        return snapshot;
    }

    private async Task<IReadOnlyCollection<CommandSnapshot>> LoadCommandSnapshotsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var commands = await dbContext.Commands.AsNoTracking()
            .Where(command => (command.UserId == userId || command.IsSystem) && !command.IsDeleted)
            .Select(command => new CommandSnapshot
            {
                CommandId = command.Id,
                CommandName = command.Name,
            })
            .ToListAsync(cancellationToken);

        var tasks = await dbContext.AgentTasks.AsNoTracking()
            .Where(task => task.UserId == userId && task.CommandId != null && !task.IsDeleted)
            .Select(task => new TaskSnapshot
            {
                AgentId = task.AgentId,
                CommandId = task.CommandId,
                CreatedAt = task.CreatedAt,
                StartedAt = task.StartedAt,
                FinishedAt = task.FinishedAt,
                Status = task.Status,
            })
            .ToListAsync(cancellationToken);

        var tasksByCommand = tasks
            .Where(task => task.CommandId.HasValue)
            .GroupBy(task => task.CommandId!.Value)
            .ToDictionary(group => group.Key, group => group.ToArray());

        foreach (var command in commands)
        {
            command.Tasks = tasksByCommand.TryGetValue(command.CommandId, out var grouped) ? grouped : [];
        }

        return commands;
    }

    private async Task<CommandSnapshot> LoadCommandSnapshotAsync(Guid userId, Guid commandId, CancellationToken cancellationToken)
    {
        var snapshot = (await LoadCommandSnapshotsAsync(userId, cancellationToken)).FirstOrDefault(item => item.CommandId == commandId);
        if (snapshot is null)
            throw new NotFoundException("Команда не найдена");

        return snapshot;
    }

    private static TaskSnapshot[] FilterToday(IEnumerable<TaskSnapshot> tasks)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return tasks.Where(task => DateOnly.FromDateTime(GetTaskDate(task)) == today).ToArray();
    }

    private static AnalyticsDto BuildAnalytics(IEnumerable<TaskSnapshot> tasks)
    {
        var snapshotArray = tasks.ToArray();
        var completed = snapshotArray.Where(IsCompletedTask).ToArray();
        var durations = completed.Select(GetDurationSeconds).ToArray();

        return new AnalyticsDto
        {
            Executions = snapshotArray.Length,
            Errors = snapshotArray.Count(task => IsFailureStatus(task.Status)),
            SuccessRate = CalculateSuccessRate(snapshotArray),
            AverageDurationSeconds = durations.Any() ? durations.Average() : 0,
            MinDurationSeconds = durations.Any() ? durations.Min() : 0,
            MaxDurationSeconds = durations.Any() ? durations.Max() : 0,
        };
    }

    private static DateTime GetTaskDate(TaskSnapshot task) => task.StartedAt ?? task.CreatedAt;

    private static bool IsCompletedTask(TaskSnapshot task) => task.StartedAt.HasValue && task.FinishedAt.HasValue;

    private static double GetDurationSeconds(TaskSnapshot task)
    {
        if (!task.FinishedAt.HasValue)
            return 0;

        return Math.Max(0, (task.FinishedAt.Value - (task.StartedAt ?? task.CreatedAt)).TotalSeconds);
    }

    private static bool IsFailureStatus(string? status)
    {
        var normalized = NormalizeStatus(status);
        return normalized is "error" or "cancelled" or "interrupted";
    }

    private static string NormalizeStatus(string? status)
    {
        return string.IsNullOrWhiteSpace(status) ? "error" : status.Trim().ToLowerInvariant();
    }

    private static double CalculateSuccessRate(IEnumerable<TaskSnapshot> tasks)
    {
        var completed = tasks.Where(task =>
        {
            var normalized = NormalizeStatus(task.Status);
            return normalized is "success" or "error" or "cancelled" or "interrupted";
        }).ToArray();

        if (!completed.Any())
            return 0;

        return (double)completed.Count(task => NormalizeStatus(task.Status) == "success") / completed.Length * 100;
    }

    private static double CalculateSpeedScore(double averageDurationSeconds, double globalAverageDuration)
    {
        if (averageDurationSeconds <= 0)
            return 0;

        if (globalAverageDuration <= 0)
            return 100;

        var ratio = globalAverageDuration / averageDurationSeconds;
        return Math.Round(Math.Clamp(ratio * 100, 0, 100), 2);
    }

    private sealed class TaskSnapshot
    {
        public Guid AgentId { get; init; }
        public Guid? CommandId { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? StartedAt { get; init; }
        public DateTime? FinishedAt { get; init; }
        public string Status { get; init; } = string.Empty;
    }

    private sealed class AgentSnapshot
    {
        public Guid AgentId { get; init; }
        public string AgentName { get; init; } = string.Empty;
        public string? IpAddress { get; init; }
        public Domain.Models.OsType? Os { get; init; }
        public string? Distribution { get; init; }
        public DateTime LastHeartbeatAt { get; init; }
        public TaskSnapshot[] Tasks { get; set; } = [];
    }

    private sealed class CommandSnapshot
    {
        public Guid CommandId { get; init; }
        public string CommandName { get; init; } = string.Empty;
        public TaskSnapshot[] Tasks { get; set; } = [];
    }
}
