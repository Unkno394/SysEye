namespace Infrastructure.Email;

public class EmailData
{
    public string Title { get; set; }
    public string Description { get; set; }
    public string Code { get; set; }
    public int ExpiryTime { get; set; } = 24;
}
