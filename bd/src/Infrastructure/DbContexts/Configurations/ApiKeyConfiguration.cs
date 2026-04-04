using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations;

public class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.ToTable("api_keys");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever()
            .IsRequired();

        builder.Property(x => x.AgentId)
            .HasColumnType("uuid");

        builder.Property(x => x.UserId)
            .HasColumnType("uuid");

        builder.Property(x => x.Value)
            .IsRequired()
            .HasMaxLength(500)
            .HasColumnType("varchar(500)");

        builder.Property(x => x.RevokedAt)
            .HasColumnType("timestamp with time zone");

        builder.HasOne(x => x.Agent)
            .WithMany()
            .HasForeignKey(x => x.AgentId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired(false);

        builder.HasIndex(x => x.AgentId)
            .HasDatabaseName("IX_api_keys_agent_id");

        builder.HasIndex(x => x.Value)
            .IsUnique()
            .HasDatabaseName("IX_api_keys_value");

        builder.HasIndex(x => x.RevokedAt)
            .HasDatabaseName("IX_api_keys_revoked_at");
    }
}
