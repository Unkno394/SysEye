namespace Infrastructure.Interfaces;

public interface IVerificationTokenProvider
{
    string GenerateApiKey(int length = 32);
    string GenerateResetToken(int length = 6);
}