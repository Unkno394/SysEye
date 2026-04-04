namespace Web.Contracts.Requests;

public class AddPlaceholderRequest
{
    public int Index { get; set; }
    public string Name { get; set; } = string.Empty;
}
