using System.ComponentModel.DataAnnotations;

namespace API.Contracts.Requests
{
    public class ResetPasswordByTokenRequest
    {
        [Required]
        [MinLength(8, ErrorMessage = "Пароль должен быть не короче 8 символов")]
        public string NewPassword { get; set; } = string.Empty;
    }
}
