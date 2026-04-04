using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

/// <summary>
/// Запрос с пагинацией для получения данных
/// </summary>
public class PagedRequest
{
    /// <summary>
    /// Количество записей для выборки (макс. 100)
    /// </summary>
    [Range(1, 100, ErrorMessage = "Take должен быть между 1 и 100")]
    public int Take { get; set; } = 10;

    /// <summary>
    /// Количество пропускаемых записей
    /// </summary>
    [Range(0, int.MaxValue, ErrorMessage = "Skip не может быть отрицательным")]
    public int Skip { get; set; } = 0;
}
