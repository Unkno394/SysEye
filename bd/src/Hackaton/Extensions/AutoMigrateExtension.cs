using Hackaton;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;

namespace Web.Extensions;

public static class AutoMigrateExtension
{
    public static IHost ApplyMigrations(this IHost host)
    {
        using var scope = host.Services.CreateScope();

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

                if (dbContext == null)
                {
                    logger.LogWarning("Контекст {ContextType} не найден в DI контейнере", contextType.Name);
                    continue;
                }

                logger.LogInformation("Применение миграций для {ContextType}...", contextType.Name);
                ApplySchemaChanges(dbContext, logger);
                ApplyCompatibilityPatches(dbContext);
                dbContext.ApplySystemCatalogSeeds();
                logger.LogInformation("Миграции для {ContextType} успешно применены", contextType.Name);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Ошибка при применении миграций для {ContextType}", contextType.Name);
                throw;
            }
        }

        return host;
    }

    private static void ApplySchemaChanges(DbContext dbContext, ILogger logger)
    {
        if (dbContext.Database.GetMigrations().Any())
        {
            dbContext.Database.Migrate();
            return;
        }

        logger.LogInformation("EF migrations were not found. Creating schema from the current model.");

        if (HasAnyApplicationTables(dbContext))
        {
            logger.LogInformation("Application tables already exist. Skipping schema creation.");
            return;
        }

        var databaseCreator = dbContext.GetService<IRelationalDatabaseCreator>();
        databaseCreator.CreateTables();
    }

    private static bool HasAnyApplicationTables(DbContext dbContext)
    {
        const string sql = """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'hackaton'
            );
            """;

        using var command = dbContext.Database.GetDbConnection().CreateCommand();
        command.CommandText = sql;

        if (command.Connection?.State != System.Data.ConnectionState.Open)
        {
            command.Connection?.Open();
        }

        var result = command.ExecuteScalar();
        return result is bool exists && exists;
    }

    private static void ApplyCompatibilityPatches(DbContext dbContext)
    {
        if (dbContext is not AppDbContext appDbContext)
            return;

        EnsureAgentColumns(appDbContext);
        EnsureAgentTaskColumns(appDbContext);
        EnsureTaskExecutionSummaryColumns(appDbContext);
        EnsureCommandColumns(appDbContext);
        EnsureScenarioTables(appDbContext);
        EnsureLegacyCompatibility(appDbContext);
    }

    private static void EnsureTaskExecutionSummaryColumns(AppDbContext dbContext)
    {
        const string sql = """
            ALTER TABLE IF EXISTS hackaton.task_executions
            ADD COLUMN IF NOT EXISTS "Status" text NOT NULL DEFAULT 'sent';

            ALTER TABLE IF EXISTS hackaton.task_executions
            ADD COLUMN IF NOT EXISTS "CompletedAt" timestamptz NULL;

            ALTER TABLE IF EXISTS hackaton.task_executions
            ADD COLUMN IF NOT EXISTS "DurationSeconds" double precision NULL;

            ALTER TABLE IF EXISTS hackaton.task_executions
            ADD COLUMN IF NOT EXISTS "ExitCode" integer NULL;

            ALTER TABLE IF EXISTS hackaton.task_executions
            ADD COLUMN IF NOT EXISTS "ResultSummary" text NOT NULL DEFAULT '';
            """;

        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureAgentColumns(AppDbContext dbContext)
    {
        const string sql = """
            ALTER TABLE IF EXISTS hackaton.agents
            ADD COLUMN IF NOT EXISTS "IpAddress" varchar(64) NULL;

            ALTER TABLE IF EXISTS hackaton.agents
            ADD COLUMN IF NOT EXISTS "Port" integer NULL;

            ALTER TABLE IF EXISTS hackaton.agents
            ADD COLUMN IF NOT EXISTS "Distribution" varchar(128) NULL;
            """;

        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureAgentTaskColumns(AppDbContext dbContext)
    {
        const string sql = """
            ALTER TABLE IF EXISTS hackaton.agent_tasks
            ADD COLUMN IF NOT EXISTS "CommandId" uuid NULL;

            CREATE INDEX IF NOT EXISTS "IX_agent_tasks_CommandId"
                ON hackaton.agent_tasks ("CommandId");
            """;

        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureCommandColumns(AppDbContext dbContext)
    {
        const string sql = """
            ALTER TABLE IF EXISTS hackaton.commands
            ADD COLUMN IF NOT EXISTS "LogRegex" text NULL;

            ALTER TABLE IF EXISTS hackaton.commands
            ADD COLUMN IF NOT EXISTS "IsSystem" boolean NOT NULL DEFAULT FALSE;
            """;

        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureScenarioTables(AppDbContext dbContext)
    {
        const string sql = """
            CREATE TABLE IF NOT EXISTS hackaton."Scenarios"
            (
                "Id" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Description" character varying(2000) NOT NULL,
                "IsDeleted" boolean NOT NULL DEFAULT FALSE,
                "IsSystem" boolean NOT NULL DEFAULT FALSE,
                CONSTRAINT "PK_Scenarios" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_Scenarios_Users_UserId" FOREIGN KEY ("UserId")
                    REFERENCES hackaton.users ("Id") MATCH SIMPLE
                    ON UPDATE NO ACTION
                    ON DELETE RESTRICT
            );

            ALTER TABLE IF EXISTS hackaton."Scenarios"
            ADD COLUMN IF NOT EXISTS "IsSystem" boolean NOT NULL DEFAULT FALSE;

            CREATE INDEX IF NOT EXISTS "IX_Scenarios_UserId_Name"
                ON hackaton."Scenarios" ("UserId", "Name");

            CREATE TABLE IF NOT EXISTS hackaton."ScenarioCommands"
            (
                "Id" uuid NOT NULL,
                "ScenarioId" uuid NOT NULL,
                "CommandId" uuid NOT NULL,
                "Order" integer NOT NULL,
                CONSTRAINT "PK_ScenarioCommands" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_ScenarioCommands_Commands_CommandId" FOREIGN KEY ("CommandId")
                    REFERENCES hackaton.commands ("Id") MATCH SIMPLE
                    ON UPDATE NO ACTION
                    ON DELETE RESTRICT,
                CONSTRAINT "FK_ScenarioCommands_Scenarios_ScenarioId" FOREIGN KEY ("ScenarioId")
                    REFERENCES hackaton."Scenarios" ("Id") MATCH SIMPLE
                    ON UPDATE NO ACTION
                    ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ScenarioCommands_ScenarioId_CommandId"
                ON hackaton."ScenarioCommands" ("ScenarioId", "CommandId");

            CREATE INDEX IF NOT EXISTS "IX_ScenarioCommands_ScenarioId_Order"
                ON hackaton."ScenarioCommands" ("ScenarioId", "Order");
            """;

        dbContext.Database.ExecuteSqlRaw(sql);
    }

    private static void EnsureLegacyCompatibility(AppDbContext dbContext)
    {
        dbContext.Database.ExecuteSqlRaw("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'hackaton'
                      AND table_name = 'api_keys'
                ) THEN
                    ALTER TABLE hackaton.api_keys
                    ADD COLUMN IF NOT EXISTS "AgentId" uuid;

                    ALTER TABLE hackaton.api_keys
                    ADD COLUMN IF NOT EXISTS "RevokedAt" timestamp with time zone;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'hackaton'
                          AND table_name = 'api_keys'
                          AND column_name = 'UserId'
                    ) THEN
                        ALTER TABLE hackaton.api_keys
                        ALTER COLUMN "UserId" DROP NOT NULL;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'hackaton'
                          AND table_name = 'api_keys'
                          AND column_name = 'Name'
                    ) THEN
                        ALTER TABLE hackaton.api_keys
                        ALTER COLUMN "Name" SET DEFAULT '';
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'hackaton'
                          AND table_name = 'api_keys'
                          AND column_name = 'IsRevoked'
                    ) THEN
                        UPDATE hackaton.api_keys
                        SET "RevokedAt" = CASE
                            WHEN COALESCE("IsRevoked", false) THEN NOW() - interval '1 second'
                            ELSE NOW() + interval '3650 days'
                        END
                        WHERE "RevokedAt" IS NULL;
                    END IF;

                    CREATE INDEX IF NOT EXISTS "IX_api_keys_agent_id" ON hackaton.api_keys ("AgentId");
                    CREATE UNIQUE INDEX IF NOT EXISTS "IX_api_keys_value" ON hackaton.api_keys ("Value");
                    CREATE INDEX IF NOT EXISTS "IX_api_keys_revoked_at" ON hackaton.api_keys ("RevokedAt");
                END IF;
            END $$;
            """);
    }
}
