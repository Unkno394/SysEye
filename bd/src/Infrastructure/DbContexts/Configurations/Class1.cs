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

        builder.Property(x => x.Status)
            .IsRequired()
            .HasColumnType("text")
            .HasDefaultValue("sent");

        builder.Property(x => x.CompletedAt)
            .HasColumnType("timestamptz");

        builder.Property(x => x.DurationSeconds)
            .HasColumnType("double precision");

        builder.Property(x => x.ExitCode)
            .HasColumnType("integer");

        builder.Property(x => x.ResultSummary)
            .IsRequired()
            .HasColumnType("text")
            .HasDefaultValue(string.Empty);

        builder.HasOne(x => x.Command)
            .WithMany()
            .HasForeignKey(x => x.CommandId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Agent)
            .WithMany()
            .HasForeignKey(x => x.AgentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.CommandId);
        builder.HasIndex(x => x.AgentId);
    }
}
