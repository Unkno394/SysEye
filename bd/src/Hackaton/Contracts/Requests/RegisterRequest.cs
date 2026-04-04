using System.ComponentModel.DataAnnotations;

namespace API.Contracts.Requests
{
    public class RegisterRequest
    {
        [Required]
        public string Name { get; set; }

        [Required]
        public string Login { get; set; }

        [Required]
        [MinLength(8, ErrorMessage = "Пароль должен быть не короче 8 символов")]
        public string Password { get; set; }

        [EmailAddress]
        public string? Email { get; set; }
    }
}
