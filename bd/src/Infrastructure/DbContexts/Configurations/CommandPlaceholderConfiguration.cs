using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations;

public class CommandPlaceholderConfiguration : IEntityTypeConfiguration<CommandPlaceholder>
{
    public void Configure(EntityTypeBuilder<CommandPlaceholder> builder)
    {
        builder.ToTable("command_placeholders");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever();

        builder.Property(x => x.CommandId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.Index)
            .IsRequired()
            .HasColumnType("integer");

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(50)
            .HasColumnType("varchar(50)");

        builder.HasOne(x => x.Command)
            .WithMany(x => x.Placeholders)
            .HasForeignKey(x => x.CommandId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
