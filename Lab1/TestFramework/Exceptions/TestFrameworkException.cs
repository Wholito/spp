namespace TestFramework.Exceptions;


public class TestFrameworkException : Exception
{
    public TestFrameworkException(string message) : base(message) { }
    
    public TestFrameworkException(string message, Exception inner) : base(message, inner) { }
}
