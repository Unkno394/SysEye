namespace Domain.Exceptions;

public class BadRequestException : Exception, IHttpException
{
    public BadRequestException(string message) : base(message) { }
    public BadRequestException(string message, Exception innerException) : base(message, innerException) { }
}
