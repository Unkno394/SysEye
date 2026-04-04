namespace Domain.Models;

public enum Role
{
    User = 0,
    Moderator = 1,
    Admin = 2,
}

public static class RoleExtension
{
    /// <returns> Роль на русском языке </returns>
    public static string ToFriendlyString(this Role role)
        => role switch
        {
            Role.User => "Пользователь",
            Role.Moderator => "Модератор",
            Role.Admin => "Администратор"
        };
}
