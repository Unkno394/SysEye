using Domain.Models;
using Infrastructure.DbContexts.Configurations;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.DbContexts;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users { get; set; }
    public DbSet<Session> UserSessions { get; set; }
    public DbSet<Token> UserTokens { get; set; }
    public DbSet<ApiKey> ApiKeys { get; set; }
    public DbSet<Agent> Agents { get; set; }
    public DbSet<AgentTask> AgentTasks { get; set; }
    public DbSet<Command> Commands { get; set; }
    public DbSet<CommandPlaceholder> CommandPlaceholders { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("hackaton");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
