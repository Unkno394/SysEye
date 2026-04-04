using Hackaton;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Web.Extensions;

public static class AutoMigrateExtension
{
    public static IHost ApplyMigrations(this IHost host)
    {
        using (var scope = host.Services.CreateScope())
        {
            var services = scope.ServiceProvider;
            var logger = services.GetRequiredService<ILogger<Program>>();

            var dbContextTypes = AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(x => x.GetTypes())
                .Where(t => typeof(DbContext).IsAssignableFrom(t) && !t.IsAbstract)
                .ToList();

            foreach (var contextType in dbContextTypes)
            {
                try
                {
                    var dbContext = services.GetService(contextType) as DbContext;

                    if (dbContext != null)
                    {
                        logger.LogInformation($"Применение миграций для {contextType.Name}...");
                        dbContext.Database.Migrate();
                        if (dbContext is AppDbContext appDbContext)
                        {
                            EnsureAgentTable(appDbContext, logger);
                            EnsureCommandTables(appDbContext, logger);
                            EnsureTaskTable(appDbContext, logger);
                        }
                        logger.LogInformation($"Миграции для {contextType.Name} успешно применены");
                    }
                    else
                    {
                        logger.LogWarning($"Контекст {contextType.Name} не найден в DI контейнере");
                    }
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, $"Ошибка при применении миграций для {contextType.Name}");
                    throw;
                }
            }
        }
        return host;
    }

    private static void EnsureAgentTable(AppDbContext dbContext, ILogger logger)
    {
        const string sql = """
            CREATE TABLE IF NOT EXISTS hackaton.agents (
                "Id" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                "Name" varchar(100) NOT NULL,
                "IpAddress" varchar(45),
                "Port" integer,
                "Os" integer,
                "Distribution" varchar(100),
                "LastHeartbeatAt" timestamptz NOT NULL,
                "IsDeleted" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_agents" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_agents_users_UserId"
                    FOREIGN KEY ("UserId")
                    REFERENCES hackaton.users ("Id")
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS "IX_agents_UserId"
                ON hackaton.agents ("UserId");

            CREATE INDEX IF NOT EXISTS "IX_agents_UserId_LastHeartbeatAt"
                ON hackaton.agents ("UserId", "LastHeartbeatAt" DESC);

            ALTER TABLE hackaton.agents
                ADD COLUMN IF NOT EXISTS "Distribution" varchar(100);
            """;

        logger.LogInformation("Проверка существования таблицы agents...");
        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureCommandTables(AppDbContext dbContext, ILogger logger)
    {
        const string sql = """
            CREATE TABLE IF NOT EXISTS hackaton.commands (
                "Id" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                "Name" varchar(100) NOT NULL,
                "Description" varchar(500) NOT NULL DEFAULT '',
                "BashScript" text NOT NULL DEFAULT '',
                "PowerShellScript" text NOT NULL DEFAULT '',
                "IsSystem" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_commands" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_commands_users_UserId"
                    FOREIGN KEY ("UserId")
                    REFERENCES hackaton.users ("Id")
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS "IX_commands_UserId"
                ON hackaton.commands ("UserId");

            CREATE INDEX IF NOT EXISTS "IX_commands_UserId_Name"
                ON hackaton.commands ("UserId", "Name");

            CREATE TABLE IF NOT EXISTS hackaton.command_placeholders (
                "Id" uuid NOT NULL,
                "CommandId" uuid NOT NULL,
                "Index" integer NOT NULL,
                "Name" varchar(50) NOT NULL,
                CONSTRAINT "PK_command_placeholders" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_command_placeholders_commands_CommandId"
                    FOREIGN KEY ("CommandId")
                    REFERENCES hackaton.commands ("Id")
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS "IX_command_placeholders_CommandId"
                ON hackaton.command_placeholders ("CommandId");

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_command_placeholders_CommandId_Index"
                ON hackaton.command_placeholders ("CommandId", "Index");
            """;

        logger.LogInformation("Проверка существования таблиц commands и command_placeholders...");
        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureTaskTable(AppDbContext dbContext, ILogger logger)
    {
        const string sql = """
            CREATE TABLE IF NOT EXISTS hackaton.agent_tasks (
                "Id" uuid NOT NULL,
                "AgentId" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                "Title" varchar(200) NOT NULL,
                "Command" text NOT NULL,
                "Status" varchar(32) NOT NULL,
                "Output" text NOT NULL DEFAULT '',
                "Error" text NOT NULL DEFAULT '',
                "ExitCode" integer,
                "CreatedAt" timestamptz NOT NULL,
                "StartedAt" timestamptz,
                "FinishedAt" timestamptz,
                "IsDeleted" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_agent_tasks" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_agent_tasks_agents_AgentId"
                    FOREIGN KEY ("AgentId")
                    REFERENCES hackaton.agents ("Id")
                    ON DELETE CASCADE,
                CONSTRAINT "FK_agent_tasks_users_UserId"
                    FOREIGN KEY ("UserId")
                    REFERENCES hackaton.users ("Id")
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS "IX_agent_tasks_AgentId"
                ON hackaton.agent_tasks ("AgentId");

            CREATE INDEX IF NOT EXISTS "IX_agent_tasks_AgentId_CreatedAt"
                ON hackaton.agent_tasks ("AgentId", "CreatedAt" DESC);

            CREATE INDEX IF NOT EXISTS "IX_agent_tasks_AgentId_Status_CreatedAt"
                ON hackaton.agent_tasks ("AgentId", "Status", "CreatedAt");

            ALTER TABLE hackaton.agent_tasks
                ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT false;
            """;

        logger.LogInformation("Проверка существования таблицы agent_tasks...");
        dbContext.Database.ExecuteSqlRaw(sql);
    }
}
