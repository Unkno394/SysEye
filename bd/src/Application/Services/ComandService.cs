using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class CommandService(AppDbContext context) : ICommandService
{
    private sealed record SystemPlaceholderDefinition(int Index, string Name);

    private sealed record SystemCommandDefinition(
        string Name,
        string Description,
        string BashScript,
        string PowerShellScript,
        IReadOnlyList<SystemPlaceholderDefinition>? Placeholders = null);

    private static readonly IReadOnlyList<SystemCommandDefinition> _systemCommands =
    [
        new(
            "Базовая проверка: hostname и ОС",
            "Собирает hostname, версию ядра и сведения о системе в стабильном key=value формате.",
            """
            printf 'hostname=%s\n' "$(hostname 2>/dev/null || echo unknown)"
            printf 'kernel=%s\n' "$(uname -srmo 2>/dev/null || uname -a)"
            if [ -f /etc/os-release ]; then
              . /etc/os-release
              printf 'distribution=%s\n' "${PRETTY_NAME:-${NAME:-unknown}}"
              printf 'version=%s\n' "${VERSION_ID:-unknown}"
            fi
            """,
            """
            $os = Get-CimInstance Win32_OperatingSystem
            $cs = Get-CimInstance Win32_ComputerSystem
            Write-Output ("hostname={0}" -f $env:COMPUTERNAME)
            Write-Output ("distribution={0}" -f $os.Caption)
            Write-Output ("version={0}" -f $os.Version)
            Write-Output ("kernel={0}" -f $os.BuildNumber)
            Write-Output ("model={0}" -f $cs.Model)
            """),
        new(
            "Базовая проверка: IP и интерфейсы",
            "Собирает адреса и интерфейсы машины в нормализованном виде для последующего сравнения.",
            """
            if command -v ip >/dev/null 2>&1; then
              ip -o link show | awk -F': ' '{gsub(/@.*/, "", $2); print "iface."$2".state="$3}'
              ip -o -4 addr show | awk '{print "iface."$2".ipv4="$4}'
              ip -o -6 addr show scope global | awk '{print "iface."$2".ipv6="$4}'
            elif command -v ifconfig >/dev/null 2>&1; then
              ifconfig | awk '/flags=/{iface=$1; sub(":", "", iface); print "iface."iface".state=up"} /inet /{print "iface."iface".ipv4="$2} /inet6 /{print "iface."iface".ipv6="$2}'
            else
              echo "interfaces=unavailable"
            fi
            """,
            """
            Get-NetIPConfiguration | ForEach-Object {
              $alias = $_.InterfaceAlias -replace '\s+', '_'
              Write-Output ("iface.{0}.state=up" -f $alias)
              foreach ($entry in $_.IPv4Address) {
                Write-Output ("iface.{0}.ipv4={1}/{2}" -f $alias, $entry.IPAddress, $entry.PrefixLength)
              }
              foreach ($entry in $_.IPv6Address) {
                Write-Output ("iface.{0}.ipv6={1}" -f $alias, $entry.IPAddress)
              }
            }
            """),
        new(
            "Базовая проверка: базовая сеть",
            "Собирает default route, DNS и локально открытые TCP-порты для сетевого снимка машины.",
            """
            if command -v ip >/dev/null 2>&1; then
              ip route show default | awk '{print "route.default="$0}'
            else
              route -n 2>/dev/null | awk 'NR>2 && $1 == "0.0.0.0" {print "route.default="$0}'
            fi
            awk '/^nameserver/{print "dns."NR"="$2}' /etc/resolv.conf 2>/dev/null
            if command -v ss >/dev/null 2>&1; then
              ss -lntH | awk '{print $4}' | sed 's/.*://' | sort -n | uniq | awk '{ports = ports ? ports","$1 : $1} END {print "listen.tcp=" ports}'
            elif command -v netstat >/dev/null 2>&1; then
              netstat -lnt 2>/dev/null | awk 'NR>2 {split($4, a, ":"); print a[length(a)]}' | sort -n | uniq | awk '{ports = ports ? ports","$1 : $1} END {print "listen.tcp=" ports}'
            else
              echo "listen.tcp=unavailable"
            fi
            """,
            """
            Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | ForEach-Object {
              Write-Output ("route.default={0}->{1}" -f $_.InterfaceAlias, $_.NextHop)
            }
            Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object {
              $alias = $_.InterfaceAlias -replace '\s+', '_'
              foreach ($server in $_.ServerAddresses) {
                Write-Output ("dns.{0}={1}" -f $alias, $server)
              }
            }
            $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
              Select-Object -ExpandProperty LocalPort -Unique |
              Sort-Object
            if ($ports) {
              Write-Output ("listen.tcp={0}" -f ($ports -join ","))
            } else {
              Write-Output "listen.tcp=unavailable"
            }
            """),
        new(
            "Диагностика: доступные порты",
            "Проверяет список TCP-портов на заданном адресе. Подходит для ручной диагностики, но не идёт в автоматическое сравнение.",
            """
            target="$1"
            ports_csv="$2"
            if [ -z "$target" ] || [ -z "$ports_csv" ]; then
              echo "target=missing"
              echo "ports=missing"
              exit 2
            fi
            printf 'target=%s\n' "$target"
            OLD_IFS="$IFS"
            IFS=','
            for port in $ports_csv; do
              clean_port="$(printf '%s' "$port" | xargs)"
              if [ -z "$clean_port" ]; then
                continue
              fi
              if command -v nc >/dev/null 2>&1; then
                nc -z -w 2 "$target" "$clean_port" >/dev/null 2>&1
              else
                timeout 2 bash -c "cat < /dev/null > /dev/tcp/$target/$clean_port" >/dev/null 2>&1
              fi
              status=$([ $? -eq 0 ] && echo open || echo closed)
              printf 'port.%s=%s\n' "$clean_port" "$status"
            done
            IFS="$OLD_IFS"
            """,
            """
            param(
              [string]$Target = "$1",
              [string]$Ports = "$2"
            )
            if ([string]::IsNullOrWhiteSpace($Target) -or [string]::IsNullOrWhiteSpace($Ports)) {
              Write-Output "target=missing"
              Write-Output "ports=missing"
              exit 2
            }
            Write-Output ("target={0}" -f $Target)
            foreach ($port in $Ports.Split(",")) {
              $value = $port.Trim()
              if ([string]::IsNullOrWhiteSpace($value)) { continue }
              $result = Test-NetConnection -ComputerName $Target -Port ([int]$value) -WarningAction SilentlyContinue
              Write-Output ("port.{0}={1}" -f $value, ($(if ($result.TcpTestSucceeded) { "open" } else { "closed" })))
            }
            """,
            [
                new SystemPlaceholderDefinition(1, "Адрес или хост"),
                new SystemPlaceholderDefinition(2, "Порты через запятую"),
            ]),
    ];

    private static readonly Func<AppDbContext, Guid, Guid, IQueryable<Command>> _getCommandQuery
        = (context, commandId, userId) => context.Commands
        .Where(c => c.Id == commandId && !c.IsDeleted && (c.UserId == userId || c.IsSystem));

    #region Commands
    public async Task<Command> CreateAsync(
        Guid userId,
        string name,
        string description,
        string bashScript,
        string powerShellScript,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BadRequestException("Имя команды не может быть пустым");

        var command = new Command
        {
            Name = name.Trim(),
            Description = description ?? string.Empty,
            BashScript = bashScript ?? string.Empty,
            PowerShellScript = powerShellScript ?? string.Empty,
            UserId = userId
        };

        context.Commands.Add(command);
        await context.SaveChangesAsync(ct);
        return command;
    }


    public async Task<PagedResult<CommandDto>> GetUserCommandsAsync(Guid userId, int take, int skip, CancellationToken ct)
    {
        await EnsureSystemCommandsAsync(userId, ct);

        var query = context.Commands.AsNoTracking()
            .Where(c => !c.IsDeleted && (c.UserId == userId || c.IsSystem));

        var commands = await query
            .OrderByDescending(c => c.IsSystem)
            .ThenBy(c => c.Name)
            .Skip(skip)
            .Take(take)
            .Select(c => new CommandDto
            {
                Id = c.Id,
                IsSystem = c.IsSystem,
                Name = c.Name,
                Description = c.Description,
                BashScript = c.BashScript,
                PowerShellScript = c.PowerShellScript,
                LogRegex = c.LogRegex,
            })
            .ToListAsync(ct);

        var count = await query.CountAsync(ct);

        return new PagedResult<CommandDto>
        {
            Items = commands,
            TotalCount = count,
            Skip = skip,
            Take = take
        };
    }

    public async Task<bool> UpdateAsync(
        Guid commandId,
        Guid userId,
        string? name,
        string? description,
        string? bashScript,
        string? powerShellScript,
        string? logRegex,
        CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        if (!string.IsNullOrWhiteSpace(name))
            command.Name = name.Trim();

        if (description != null)
            command.Description = description;

        if (bashScript != null)
            command.BashScript = bashScript;

        if (powerShellScript != null)
            command.PowerShellScript = powerShellScript;

        if (logRegex != null)
            command.LogRegex = logRegex;

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid commandId, Guid userId, CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .ExecuteUpdateAsync(setter => setter.SetProperty(
                property => property.IsDeleted, true));

        return true;
    }
    #endregion

    #region Placeholderspublic
    public async Task<List<CommandPlaceholderDto>> GetCommandPlaceholdersAsync(Guid commandId, Guid userId, CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId).FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        return await context.CommandPlaceholders
            .Where(p => p.CommandId == commandId)
            .Select(p => new CommandPlaceholderDto
            {
                Index = p.Index,
                Name = p.Name,
            })
            .ToListAsync(ct);
    }

    public async Task<CommandPlaceholder> AddPlaceholderAsync(
       Guid commandId,
       Guid userId,
       int index,
       string name,
       CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        var placeholder = new CommandPlaceholder
        {
            CommandId = command.Id,
            Index = index,
            Name = name.Trim()
        };

        context.CommandPlaceholders.Add(placeholder);
        await context.SaveChangesAsync(ct);
        return placeholder;
    }

    public async Task<bool> UpdatePlaceholderAsync(
        Guid commandId,
        Guid userId,
        int index,
        string? name,
        CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        var placeholder = await context.CommandPlaceholders
            .FirstOrDefaultAsync(p => p.CommandId == commandId && p.Index == index, ct);

        if (placeholder == null) throw new NotFoundException("Плейсхолдер не найден");

        if (!string.IsNullOrWhiteSpace(name))
            placeholder.Name = name.Trim();

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeletePlaceholderAsync(
        Guid commandId,
        Guid userId,
        int index,
        CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        var placeholder = await context.CommandPlaceholders
            .FirstOrDefaultAsync(p => p.CommandId == commandId && p.Index == index, ct);

        if (placeholder == null) throw new NotFoundException("Плейсхолдер не найден");

        context.CommandPlaceholders.Remove(placeholder);
        await context.SaveChangesAsync(ct);
        return true;
    }
    #endregion

    private async Task EnsureSystemCommandsAsync(Guid userId, CancellationToken ct)
    {
        var existing = await context.Commands
            .Where(c => c.UserId == userId && c.IsSystem && !c.IsDeleted)
            .ToListAsync(ct);

        var hasChanges = false;

        foreach (var definition in _systemCommands)
        {
            var command = existing.FirstOrDefault(c => c.Name == definition.Name);

            if (command is null)
            {
                command = new Command
                {
                    UserId = userId,
                    Name = definition.Name,
                    Description = definition.Description,
                    BashScript = definition.BashScript,
                    PowerShellScript = definition.PowerShellScript,
                    IsSystem = true,
                    IsDeleted = false,
                };

                context.Commands.Add(command);
                existing.Add(command);
                hasChanges = true;
            }
            else
            {
                if (command.Description != definition.Description)
                {
                    command.Description = definition.Description;
                    hasChanges = true;
                }

                if (command.BashScript != definition.BashScript)
                {
                    command.BashScript = definition.BashScript;
                    hasChanges = true;
                }

                if (command.PowerShellScript != definition.PowerShellScript)
                {
                    command.PowerShellScript = definition.PowerShellScript;
                    hasChanges = true;
                }

                if (!command.IsSystem)
                {
                    command.IsSystem = true;
                    hasChanges = true;
                }

                if (command.IsDeleted)
                {
                    command.IsDeleted = false;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges)
        {
            await context.SaveChangesAsync(ct);
        }

        var systemCommandsByName = await context.Commands
            .Where(c => c.UserId == userId && c.IsSystem && !c.IsDeleted)
            .ToDictionaryAsync(c => c.Name, c => c, ct);

        foreach (var definition in _systemCommands.Where(item => item.Placeholders is { Count: > 0 }))
        {
            if (!systemCommandsByName.TryGetValue(definition.Name, out var command))
            {
                continue;
            }

            var existingPlaceholders = await context.CommandPlaceholders
                .Where(p => p.CommandId == command.Id)
                .ToListAsync(ct);

            foreach (var placeholder in definition.Placeholders ?? [])
            {
                if (existingPlaceholders.Any(p => p.Index == placeholder.Index))
                {
                    continue;
                }

                context.CommandPlaceholders.Add(new CommandPlaceholder
                {
                    CommandId = command.Id,
                    Index = placeholder.Index,
                    Name = placeholder.Name,
                });

                hasChanges = true;
            }
        }

        if (hasChanges)
        {
            await context.SaveChangesAsync(ct);
        }
    }
}
