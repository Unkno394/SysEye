using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations;

public class AgentTaskConfiguration : IEntityTypeConfiguration<AgentTask>
{
    public void Configure(EntityTypeBuilder<AgentTask> builder)
    {
        builder.ToTable("agent_tasks");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever();

        builder.Property(x => x.AgentId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.UserId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(200)
            .HasColumnType("varchar(200)");

        builder.Property(x => x.Command)
            .IsRequired()
            .HasColumnType("text");

        builder.Property(x => x.Status)
            .IsRequired()
            .HasMaxLength(32)
            .HasColumnType("varchar(32)");

        builder.Property(x => x.Output)
            .IsRequired()
            .HasColumnType("text");

        builder.Property(x => x.Error)
            .IsRequired()
            .HasColumnType("text");

        builder.Property(x => x.ExitCode)
            .HasColumnType("integer");

        builder.Property(x => x.CreatedAt)
            .IsRequired()
            .HasColumnType("timestamptz");

        builder.Property(x => x.StartedAt)
            .HasColumnType("timestamptz");

        builder.Property(x => x.FinishedAt)
            .HasColumnType("timestamptz");

        builder.Property(x => x.IsDeleted)
            .IsRequired()
            .HasColumnType("boolean");

        builder.HasOne(x => x.Agent)
            .WithMany()
            .HasForeignKey(x => x.AgentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
