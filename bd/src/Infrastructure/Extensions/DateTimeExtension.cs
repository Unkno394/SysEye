namespace Infrastructure.Extensions;

public static class DateTimeExtension
{
    public static ulong ToUnixNano(this DateTimeOffset value)
    {
        var utc = value.ToUniversalTime();
        var seconds = utc.ToUnixTimeSeconds();
        var ticksWithinSecond = utc.Ticks % TimeSpan.TicksPerSecond;
        var nanosWithinSecond = ticksWithinSecond * 100L;

        return (ulong)(seconds * 1_000_000_000L + nanosWithinSecond);
    }
}
