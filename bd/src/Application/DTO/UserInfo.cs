using Domain.Models;

namespace Application.DTO
{
    public class UserInfo()
    {
        public Guid Id { get; set; }
        public Role Role { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Login { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public bool IsEmailConfirmed {get; set;}
    }
}
