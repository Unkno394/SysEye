namespace Infrastructure.Options;

public class LoggingOptions
{
    public string LogLevel { get; set; } = "Information";
    public bool ConsoleEnabled { get; set; } = true;
    public bool FileEnabled { get; set; } = true;
    public string LogPath { get; set; } = "Logs/log-.txt";
}
