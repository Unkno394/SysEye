using Infrastructure.Interfaces;
using Infrastructure.Options;
using Infrastructure.Services;
using Microsoft.Extensions.Options;

namespace Web.Extensions;

public static class AddLokiLogReaderExtension
{
    public static IServiceCollection AddLokiLogReader(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddHttpClient<ILokiLogReader, LokiLogReader>((serviceProvider, client) =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<LokiOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
        });

        return services;
    }
}