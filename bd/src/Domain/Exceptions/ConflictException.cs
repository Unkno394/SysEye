namespace Domain.Exceptions;

public class ConflictException : Exception, IHttpException
{
    public ConflictException(string message) : base(message) { }
    public ConflictException(string message, Exception innerException) : base(message, innerException) { }
}
