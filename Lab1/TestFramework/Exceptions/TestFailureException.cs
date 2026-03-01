namespace TestFramework.Exceptions;

public class TestFailureException : TestFrameworkException
{
    public TestFailureException(string message) : base(message) { }

    public TestFailureException(string message, Exception inner) : base(message, inner) { }
}
