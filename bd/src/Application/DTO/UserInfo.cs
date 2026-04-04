using Domain.Models;

namespace Application.DTO
{
    public class UserInfo()
    {
        public Role Role { get; set; }
        public string Name { get; set; }
        public string Login { get; set; }
        public string Email { get; set; }
        public bool IsEmailConfirmed {get; set;}
    }
}
