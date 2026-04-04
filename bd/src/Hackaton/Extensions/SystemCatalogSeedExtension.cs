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
        var seedPath = Path.Combine(AppContext.BaseDirectory, "DatabaseSeeds", "100_agents_real_final_seed_idempotent.sql");
        if (!File.Exists(seedPath))
            return;

        var sql = File.ReadAllText(seedPath).Replace(
            $"v_system_user_id uuid := '{SystemSeedPlaceholderUserId}';",
            $"v_system_user_id uuid := '{SystemUserId}';",
            StringComparison.Ordinal);

        ExecuteSqlDirect(dbContext, sql);
    }

    private static void ApplySystemScenarioSeed(DbContext dbContext)
    {
        dbContext.Database.ExecuteSqlRaw($$"""
            ALTER TABLE IF EXISTS hackaton."Scenarios"
            ADD COLUMN IF NOT EXISTS "IsSystem" boolean NOT NULL DEFAULT false;

            CREATE TEMP TABLE _seed_scenarios (
                "Name" varchar(200) NOT NULL,
                "Description" varchar(500) NOT NULL
            ) ON COMMIT DROP;

            CREATE TEMP TABLE _seed_scenario_commands (
                "ScenarioName" varchar(200) NOT NULL,
                "CommandName" varchar(200) NOT NULL,
                "Order" integer NOT NULL
            ) ON COMMIT DROP;

            INSERT INTO _seed_scenarios ("Name", "Description")
            VALUES
                ('System quick audit', 'Quick host overview: uptime, OS, network, resources, and processes.'),
                ('Network snapshot', 'Network state snapshot: addresses, routes, DNS, and active TCP connections.'),
                ('Resource pressure check', 'CPU, memory, and top process pressure check.'),
                ('Docker quick check', 'Quick Docker environment overview and basic host state.');

            INSERT INTO _seed_scenario_commands ("ScenarioName", "CommandName", "Order")
            VALUES
                ('System quick audit', 'Hostname', 1),
                ('System quick audit', 'Current user', 2),
                ('System quick audit', 'Current time', 3),
                ('System quick audit', 'System uptime', 4),
                ('System quick audit', 'OS name', 5),
                ('System quick audit', 'OS version', 6),
                ('System quick audit', 'Kernel / build version', 7),
                ('System quick audit', 'IPv4 addresses', 8),
                ('System quick audit', 'RAM usage percent', 9),
                ('System quick audit', 'CPU usage current', 10),
                ('System quick audit', 'Process count', 11),
                ('Network snapshot', 'Hostname', 1),
                ('Network snapshot', 'IPv4 addresses', 2),
                ('Network snapshot', 'IPv6 addresses', 3),
                ('Network snapshot', 'DNS servers', 4),
                ('Network snapshot', 'IPv4 routes', 5),
                ('Network snapshot', 'IPv6 routes', 6),
                ('Network snapshot', 'Listening TCP ports', 7),
                ('Network snapshot', 'All TCP connections', 8),
                ('Network snapshot', 'Active network adapters', 9),
                ('Resource pressure check', 'System uptime', 1),
                ('Resource pressure check', 'RAM usage percent', 2),
                ('Resource pressure check', 'Free memory MB', 3),
                ('Resource pressure check', 'Total memory MB', 4),
                ('Resource pressure check', 'CPU usage current', 5),
                ('Resource pressure check', 'CPU count', 6),
                ('Resource pressure check', 'Top CPU processes', 7),
                ('Resource pressure check', 'Top memory processes', 8),
                ('Resource pressure check', 'Process count', 9),
                ('Docker quick check', 'Hostname', 1),
                ('Docker quick check', 'Current time', 2),
                ('Docker quick check', 'System uptime', 3),
                ('Docker quick check', 'Docker containers list', 4),
                ('Docker quick check', 'Listening TCP ports', 5),
                ('Docker quick check', 'All TCP connections', 6);

            UPDATE hackaton."Scenarios" AS s
            SET
                "UserId" = '{{SystemUserId}}'::uuid,
                "Description" = ss."Description",
                "IsDeleted" = false,
                "IsSystem" = true
            FROM _seed_scenarios AS ss
            WHERE s."Name" = ss."Name"
              AND s."IsSystem" = true;

            INSERT INTO hackaton."Scenarios" (
                "Id",
                "UserId",
                "Name",
                "Description",
                "IsDeleted",
                "IsSystem"
            )
            SELECT
                gen_random_uuid(),
                '{{SystemUserId}}'::uuid,
                ss."Name",
                ss."Description",
                false,
                true
            FROM _seed_scenarios AS ss
            WHERE NOT EXISTS (
                SELECT 1
                FROM hackaton."Scenarios" AS s
                WHERE s."Name" = ss."Name"
                  AND s."IsSystem" = true
            );

            DELETE FROM hackaton."ScenarioCommands" AS sc
            USING hackaton."Scenarios" AS s
            WHERE sc."ScenarioId" = s."Id"
              AND s."IsSystem" = true
              AND EXISTS (
                  SELECT 1
                  FROM _seed_scenarios AS ss
                  WHERE ss."Name" = s."Name"
              );

            INSERT INTO hackaton."ScenarioCommands" (
                "Id",
                "ScenarioId",
                "CommandId",
                "Order"
            )
            SELECT
                gen_random_uuid(),
                s."Id",
                c."Id",
                ssc."Order"
            FROM _seed_scenario_commands AS ssc
            JOIN hackaton."Scenarios" AS s
              ON s."Name" = ssc."ScenarioName"
             AND s."IsSystem" = true
            JOIN hackaton.commands AS c
              ON c."Name" = ssc."CommandName"
             AND c."IsSystem" = true;

            DELETE FROM hackaton."Scenarios" AS s
            WHERE s."IsSystem" = true
              AND NOT EXISTS (
                  SELECT 1
                  FROM _seed_scenarios AS ss
                  WHERE ss."Name" = s."Name"
              );
            """);
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
