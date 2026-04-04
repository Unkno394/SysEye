namespace Domain.Exceptions;

public class TeapotException : Exception
{
    public TeapotException(string message) : base(message) { }
}
