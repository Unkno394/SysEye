namespace Application.DTO;

public class PagedResult<T>
{
    public required List<T> Items { get; init; }
    public required long TotalCount { get; init; }
    public required int Take { get; init; }
    public required int Skip { get; init; }
}