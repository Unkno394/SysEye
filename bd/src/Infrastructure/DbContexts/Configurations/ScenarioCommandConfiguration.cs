using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Configurations;

public class ScenarioCommandConfiguration : IEntityTypeConfiguration<ScenarioCommand>
{
    public void Configure(EntityTypeBuilder<ScenarioCommand> builder)
    {
        builder.ToTable("ScenarioCommands");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .ValueGeneratedNever();

        builder.Property(x => x.ScenarioId)
            .IsRequired();

        builder.Property(x => x.CommandId)
            .IsRequired();

        builder.Property(x => x.Order)
            .IsRequired();

        builder.HasOne(x => x.Scenario)
            .WithMany(x => x.Commands)
            .HasForeignKey(x => x.ScenarioId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Command)
            .WithMany()
            .HasForeignKey(x => x.CommandId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.ScenarioId, x.CommandId })
            .IsUnique();

        builder.HasIndex(x => new { x.ScenarioId, x.Order });
    }
}