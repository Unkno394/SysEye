using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DbContexts.Configurations
{
    public class SessionConfiguration : IEntityTypeConfiguration<Session>
    {
        public void Configure(EntityTypeBuilder<Session> builder)
        {
            builder.ToTable("sessions");

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Id)
                .HasColumnType("uuid")
                .ValueGeneratedNever();

            builder.Property(x => x.UserId)
                .IsRequired()
                .HasColumnType("uuid");

            builder.Property(x => x.TokenId)
                .IsRequired()
                .HasColumnType("uuid");

            builder.Property(x => x.LoginDate)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp with time zone");

            builder.Property(x => x.LastActivity)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp with time zone");

            builder.Property(x => x.LogoutDate)
                .HasColumnType("timestamp with time zone");

            builder.Property(x => x.IsActive)
                .HasDefaultValue(true);

            builder.HasOne(x => x.User)
                .WithMany(u => u.Sessions)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            builder.HasOne(x => x.Token)
                .WithOne(t => t.Session)
                .HasForeignKey<Token>(x => x.SessionId)
                .OnDelete(DeleteBehavior.Cascade);

            builder.HasIndex(x => x.UserId)
                .HasDatabaseName("IX_Sessions_UserId");

            builder.HasIndex(x => new { x.LastActivity })
                .HasDatabaseName("IX_Sessions_LastActivity");
        }
    }
}
