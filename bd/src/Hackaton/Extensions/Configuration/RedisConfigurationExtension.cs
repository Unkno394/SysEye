using Infrastructure.Options;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace Web.Extensions.Configuration;

public static class RedisConfigurationExtension
{
    public static IHostApplicationBuilder AddRedis(this IHostApplicationBuilder builder)
    {
        var connectionString = builder.Services.BuildServiceProvider()
            .GetRequiredService<IOptions<ConnectionStringsOptions>>().Value;

        var useInMemoryCache = builder.Environment.IsDevelopment()
            || connectionString.RedisConnectionString.Contains("localhost:6379", StringComparison.OrdinalIgnoreCase)
            || connectionString.RedisConnectionString.Contains("127.0.0.1:6379", StringComparison.OrdinalIgnoreCase);

        if (useInMemoryCache)
        {
            builder.Services.AddDistributedMemoryCache();
            return builder;
        }

        builder.Services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = connectionString.RedisConnectionString;
            options.InstanceName = connectionString.RedisInstanceName;
        });

        builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
        {
            var config = ConfigurationOptions.Parse(connectionString.RedisConnectionString);
            config.AbortOnConnectFail = false;
            config.ConnectTimeout = 10000;

            var muxer = ConnectionMultiplexer.Connect(config);
            return muxer;
        });

        return builder;
    }
}
