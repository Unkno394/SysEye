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
}
