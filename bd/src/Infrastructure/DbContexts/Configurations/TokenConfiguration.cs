using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations;

public class TokenConfiguration : IEntityTypeConfiguration<Token>
{
    public void Configure(EntityTypeBuilder<Token> builder)
    {
        builder.ToTable("tokens");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever();

        builder.Property(x => x.SessionId)
            .IsRequired()
            .HasColumnType("uuid");

        builder.Property(x => x.RefreshToken)
            .IsRequired()
            .HasMaxLength(500)
            .HasColumnType("varchar(500)");

        builder.Property(x => x.CreatedAt)
            .HasDefaultValueSql("CURRENT_TIMESTAMP")
            .HasColumnType("timestamp with time zone");

        builder.Property(x => x.IsRevoked)
            .HasDefaultValue(false);

        builder.HasOne(x => x.Session)
            .WithOne(s => s.Token)
            .HasForeignKey<Token>(x => x.SessionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.RefreshToken)
            .IsUnique()
            .HasDatabaseName("IX_Tokens_RefreshToken");

        builder.HasIndex(x => x.SessionId)
            .IsUnique()
            .HasDatabaseName("IX_Tokens_SessionId");
    }
}
