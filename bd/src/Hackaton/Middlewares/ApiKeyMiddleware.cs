using Application.Interfaces;
using Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace Web.Middlewares;

public class ApiKeyMiddleware(RequestDelegate next, IOptions<ApiKeyOptions> options)
{
    public const string ApiKeyUserIdItemKey = "ApiKeyUserId";
    public const string ApiKeyValueItemKey = "ApiKeyValue";

    public async Task InvokeAsync(HttpContext context, IApiKeyService apiKeyService)
    {
        if (!options.Value.UseApiKeyAccess)
        {
            await next(context);
            return;
        }

        var requestPath = context.Request.Path.Value ?? "";

        if (requestPath.StartsWith("/internal", StringComparison.OrdinalIgnoreCase))
        {
            if (!context.Request.Headers.TryGetValue(options.Value.Header, out var extractedApiKey))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: Missing API key.");
                return;
            }

            var apiKey = extractedApiKey.ToString();
            var ownerId = await apiKeyService.GetOwnerId(apiKey, context.RequestAborted);

            if (!ownerId.HasValue)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: Invalid API key.");
                return;
            }

            context.Items[ApiKeyUserIdItemKey] = ownerId.Value;
            context.Items[ApiKeyValueItemKey] = apiKey;
        }

        await next(context);
    }
}
