namespace Infrastructure.Options;

public class ConnectionStringsOptions
{
    public string DatabaseConnectionTemplate { get; set; }
    public string DatabasePassword { get; set; }

    public string RedisConnectionTemplate { get; set; }
    public string RedisPassword { get; set; }
    public string RedisInstanceName { get; set; }

    public string RedisConnectionString
    {
        get => string.Format(RedisConnectionTemplate, RedisPassword);
    }

    public string DatabaseConnectionString
    {
        get => string.Format(DatabaseConnectionTemplate, DatabasePassword);
    }
}
