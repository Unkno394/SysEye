namespace Domain.Exceptions;

public class NotFoundException : Exception , IHttpException
{
    public NotFoundException(string message, Exception innerException) : base(message, innerException) { }
    public NotFoundException(string message) : base(message) { }
}
