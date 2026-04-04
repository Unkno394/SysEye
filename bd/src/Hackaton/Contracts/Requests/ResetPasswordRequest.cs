using System.ComponentModel.DataAnnotations;

namespace API.Contracts.Requests
{
    public class ResetPasswordRequest
    {
        [Required]
        [MinLength(8, ErrorMessage = "Пароль должен быть не короче 8 символов")]
        public string NewPassword { get; set; }
        
        [Required]
        [MinLength(8, ErrorMessage = "Пароль должен быть не короче 8 символов")]
        public string OldPassword { get; set; }
    }
}
