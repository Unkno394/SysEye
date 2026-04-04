using Domain.Models.Common;

namespace Domain.Models;

public class User : IEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; }
    public string Login { get; set; }
    public string PasswordHash { get; set; }
    public string? Email { get; private set; }
    public Role Role { get; set; } = Role.User;

    public DateTime RegistrationDate { get; } = DateTime.UtcNow;
    public DateTime PasswordChangeDate { get; set; } = DateTime.UtcNow;

    public bool IsEmailConfirmed { get; private set; } = false;
    public bool IsDeleted { get; set; } = false;
    public bool IsBanned { get; set; } = false;

    public virtual ICollection<Session> Sessions { get; set; }

    public void ConfirmEmail()
    {
        IsEmailConfirmed = true;
    }

    public void ChangeEmail(string email)
    {
        Email = email;
        IsEmailConfirmed = false;
    }
}