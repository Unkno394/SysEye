namespace Domain.Exceptions;

public class UnauthorizedException : Exception, IHttpException
{
    public UnauthorizedException(string message) : base(message) { }
    public UnauthorizedException(string message, Exception innerException) : base(message, innerException) { }
}
