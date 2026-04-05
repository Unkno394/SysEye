namespace Application.DTO.ApiKey;

public class ApiKeySmallDto
{
    public Guid Id { get; set; }
    public DateTime RevokedAt { get; set; }
}