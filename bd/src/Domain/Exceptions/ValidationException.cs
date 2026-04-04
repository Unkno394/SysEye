namespace Domain.Exceptions;

public class ValidationException : Exception, IHttpException
{
    public ValidationException(string message) : base(message) { }
    public ValidationException(string message, Exception innerException) : base(message, innerException) { }
}
