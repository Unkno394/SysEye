namespace Application.DTO.Analytics;

public class ExportFileDto
{
    public required byte[] Content { get; init; }
    public required string ContentType { get; init; }
    public required string FileName { get; init; }
}
