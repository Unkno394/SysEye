namespace Infrastructure.Interfaces;

public interface IVerificationTokenProvider
{
    string GenerateResetToken(int length = 6);
}