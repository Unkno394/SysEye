using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations;

public class CommandConfiguration : IEntityTypeConfiguration<Command>
{
    public void Configure(EntityTypeBuilder<Command> builder)
    {
        builder.ToTable("commands");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever();

        builder.Property(x => x.UserId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(100)
            .HasColumnType("varchar(100)");

        builder.Property(x => x.Description)
            .HasMaxLength(500)
            .HasColumnType("varchar(500)");

        builder.Property(x => x.BashScript)
            .IsRequired()
            .HasColumnType("text");

        builder.Property(x => x.PowerShellScript)
            .IsRequired()
            .HasColumnType("text");

        builder.Property(x => x.IsSystem)
            .HasDefaultValue(false);

        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(x => x.Placeholders)
            .WithOne(x => x.Command)
            .HasForeignKey(x => x.CommandId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
