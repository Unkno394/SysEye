using Microsoft.EntityFrameworkCore;
using System.Data;

namespace Web.Extensions;

public static class SystemCatalogSeedExtension
{
    private const string SystemUserId = "11111111-1111-1111-1111-111111111111";
    private const string SystemUserLogin = "__system_catalog__";
    private const string SystemSeedPlaceholderUserId = "00000000-0000-0000-0000-000000000000";

    public static void ApplySystemCatalogSeeds(this DbContext dbContext)
    {
        EnsureSystemUser(dbContext);
        ApplySystemCommandSeed(dbContext);
        ApplySystemScenarioSeed(dbContext);
    }

    private static void EnsureSystemUser(DbContext dbContext)
    {
        dbContext.Database.ExecuteSqlRaw($$"""
            INSERT INTO hackaton.users (
                "Id",
                "Name",
                "Login",
                "PasswordHash",
                "Email",
                "Role",
                "RegistrationDate",
                "PasswordChangeDate",
                "IsEmailConfirmed",
                "IsDeleted",
                "IsBanned"
            )
            VALUES (
                '{{SystemUserId}}'::uuid,
                'System Catalog',
                '{{SystemUserLogin}}',
                'SYSTEM_CATALOG_NOT_FOR_LOGIN',
                NULL,
                2,
                NOW(),
                NOW(),
                true,
                false,
                false
            )
            ON CONFLICT ("Id") DO UPDATE
            SET
                "Name" = EXCLUDED."Name",
                "Login" = EXCLUDED."Login",
                "PasswordHash" = EXCLUDED."PasswordHash",
                "Role" = EXCLUDED."Role",
                "IsEmailConfirmed" = true,
                "IsDeleted" = false,
                "IsBanned" = false;
            """);
    }

    private static void ApplySystemCommandSeed(DbContext dbContext)
    {
        ApplySeedFile(dbContext, "100_agents_real_final_seed_idempotent.sql");
    }

    private static void ApplySystemScenarioSeed(DbContext dbContext)
    {
        ApplySeedFile(dbContext, "system_scenarios_seed.sql");
    }

    private static void ApplySeedFile(DbContext dbContext, string fileName)
    {
        var seedPath = Path.Combine(AppContext.BaseDirectory, "DatabaseSeeds", fileName);
        if (!File.Exists(seedPath))
            return;

        var sql = File.ReadAllText(seedPath).Replace(
            $"v_system_user_id uuid := '{SystemSeedPlaceholderUserId}';",
            $"v_system_user_id uuid := '{SystemUserId}';",
            StringComparison.Ordinal);

        ExecuteSqlDirect(dbContext, sql);
    }

    private static void ExecuteSqlDirect(DbContext dbContext, string sql)
    {
        var connection = dbContext.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;

        if (shouldClose)
        {
            connection.Open();
        }

        try
        {
            using (var setupCommand = connection.CreateCommand())
            {
                setupCommand.CommandText = "SET search_path TO hackaton, public;";
                setupCommand.ExecuteNonQuery();
            }

            using var command = connection.CreateCommand();
            command.CommandText = sql;
            command.ExecuteNonQuery();
        }
        finally
        {
            if (shouldClose)
            {
                connection.Close();
            }
        }
    }
}
