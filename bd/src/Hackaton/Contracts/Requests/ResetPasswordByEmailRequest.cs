using System.ComponentModel.DataAnnotations;

namespace API.Contracts.Requests
{
    public class ResetPasswordByEmailRequest
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; }

        [Required]
        public string Token { get; set; }
    }
}
