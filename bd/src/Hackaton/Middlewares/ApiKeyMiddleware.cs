using Infrastructure.DbContexts;
using Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Web.Middlewares;

public class ApiKeyMiddleware(RequestDelegate next, IOptions<ApiKeyOptions> options)
{
    public const string ApiKeyUserIdItemKey = "ApiKeyUserId";
    public const string ApiKeyAgentIdItemKey = "ApiKeyAgentId";
    public const string ApiKeyValueItemKey = "ApiKeyValue";

    public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
    {
        if (!options.Value.UseApiKeyAccess)
        {
            await next(context);
            return;
        }

        var requestPath = context.Request.Path.Value ?? "";

        if (requestPath.StartsWith("/internal", StringComparison.OrdinalIgnoreCase))
        {
            if (!context.Request.Headers.TryGetValue(options.Value.ApiKeyHeader, out var extractedApiKey))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: Missing API key.");
                return;
            }

            var apiKey = extractedApiKey.ToString();
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: Missing API key.");
                return;
            }

            var resolvedContext = await dbContext.ApiKeys.AsNoTracking()
                .Where(a => a.Value == apiKey
                    && a.RevokedAt > DateTime.UtcNow
                    && !a.Agent.IsDeleted)
                .Select(a => new
                {
                    a.Value,
                    a.AgentId,
                    a.Agent.UserId
                })
                .FirstOrDefaultAsync(context.RequestAborted);

            if (resolvedContext is null)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: Invalid API key.");
                return;
            }

            context.Items[ApiKeyUserIdItemKey] = resolvedContext.UserId;
            context.Items[ApiKeyAgentIdItemKey] = resolvedContext.AgentId;
            context.Items[ApiKeyValueItemKey] = resolvedContext.Value;
        }

        await next(context);
    }
}
