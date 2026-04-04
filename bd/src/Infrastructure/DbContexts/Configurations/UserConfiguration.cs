using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasColumnType("uuid")
            .ValueGeneratedNever();

        builder.Property(x => x.Login)
            .IsRequired()
            .HasMaxLength(50)
            .HasColumnType("varchar(50)");

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(50)
            .HasColumnType("varchar(50)");

        builder.Property(x => x.PasswordHash)
            .IsRequired()
            .HasMaxLength(255)
            .HasColumnType("varchar(255)");

        builder.Property(x => x.Email)
            .HasMaxLength(100)
            .HasColumnType("varchar(100)");

        builder.Property(x => x.IsEmailConfirmed)
            .HasDefaultValue(false);

        builder.Property(x => x.IsDeleted)
            .HasDefaultValue(false);

        builder.Property(x => x.IsBanned)
            .HasDefaultValue(false);

        builder.Property(x => x.RegistrationDate)
            .HasDefaultValueSql("CURRENT_TIMESTAMP")
            .HasColumnType("timestamp with time zone");

        builder.Property(x => x.PasswordChangeDate)
          .HasDefaultValueSql("CURRENT_TIMESTAMP")
          .HasColumnType("timestamp with time zone");

        builder.HasIndex(x => x.Login)
            .IsUnique()
            .HasDatabaseName("IX_Users_Login");

        builder.HasIndex(x => x.Email)
            .IsUnique()
            .HasDatabaseName("IX_Users_Email")
            .HasFilter("\"Email\" IS NOT NULL");

        builder.HasIndex(x => new { x.IsDeleted, x.IsBanned })
            .HasDatabaseName("IX_Users_Status");
    }
}
