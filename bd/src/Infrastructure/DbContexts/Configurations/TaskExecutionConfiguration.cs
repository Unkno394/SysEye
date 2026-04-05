namespace Infrastructure.DbContexts.Configurations;

using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class TaskExecutionConfiguration : IEntityTypeConfiguration<TaskExecution>
{
    public void Configure(EntityTypeBuilder<TaskExecution> builder)
    {
        builder.ToTable("task_executions");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever();

        builder.Property(x => x.CommandId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.AgentId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.StartedAt)
            .IsRequired()
            .HasColumnType("timestamptz");

        builder.Property(x => x.DurationSeconds)
            .IsRequired()
            .HasDefaultValue(0)
            .HasColumnType("double precision");

        builder.Property(x => x.IsSuccess)
            .IsRequired()
            .HasDefaultValue(false)
            .HasColumnType("boolean");

        builder.HasOne(x => x.Command)
            .WithMany()
            .HasForeignKey(x => x.CommandId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Agent)
            .WithMany()
            .HasForeignKey(x => x.AgentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.CommandId)
            .HasDatabaseName("ix_task_executions_command_id");

        builder.HasIndex(x => x.AgentId)
            .HasDatabaseName("ix_task_executions_agent_id");

        builder.HasIndex(x => x.IsSuccess)
            .HasDatabaseName("ix_task_executions_is_success");
    }
}