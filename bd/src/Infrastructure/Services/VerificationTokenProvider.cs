using Infrastructure.Interfaces;
using System.Security.Cryptography;

namespace Infrastructure.Services;

public class VerificationTokenProvider : IVerificationTokenProvider
{
    public string GenerateResetToken(int length = 6)
    {
        var min = (int)Math.Pow(10, length - 1);
        var max = (int)Math.Pow(10, length) - 1;
        return Random.Shared.Next(min, max).ToString();
    }

    public string GenerateApiKey(int length = 32)
    {
        byte[] bytes = new byte[length];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .Replace("+", "")
            .Replace("/", "")
            .Replace("=", "");
    }
}
