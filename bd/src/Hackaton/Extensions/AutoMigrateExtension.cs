using Hackaton;
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
                        ApplyCompatibilityPatches(dbContext);
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

    private static void ApplyCompatibilityPatches(DbContext dbContext)
    {
        dbContext.Database.ExecuteSqlRaw("""
            ALTER TABLE IF EXISTS hackaton.commands
            ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT false;
            """);

        dbContext.Database.ExecuteSqlRaw("""
            ALTER TABLE IF EXISTS hackaton.api_keys
            ADD COLUMN IF NOT EXISTS "AgentId" uuid;

            ALTER TABLE IF EXISTS hackaton.api_keys
            ADD COLUMN IF NOT EXISTS "RevokedAt" timestamp with time zone;

            ALTER TABLE IF EXISTS hackaton.api_keys
            ALTER COLUMN "UserId" DROP NOT NULL;

            ALTER TABLE IF EXISTS hackaton.api_keys
            ALTER COLUMN "Name" SET DEFAULT '';

            UPDATE hackaton.api_keys
            SET "RevokedAt" = CASE
                WHEN COALESCE("IsRevoked", false) THEN NOW() - interval '1 second'
                ELSE NOW() + interval '3650 days'
            END
            WHERE "RevokedAt" IS NULL;

            CREATE INDEX IF NOT EXISTS "IX_api_keys_agent_id" ON hackaton.api_keys ("AgentId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_api_keys_value" ON hackaton.api_keys ("Value");
            CREATE INDEX IF NOT EXISTS "IX_api_keys_revoked_at" ON hackaton.api_keys ("RevokedAt");
            """);
    }
}
