namespace TestFramework.Exceptions;

public class AssertionFailedException : TestFrameworkException
{
    public string? Expected { get; }
    public string? Actual { get; }

    public AssertionFailedException(string message) : base(message) { }

    public AssertionFailedException(string message, string? expected, string? actual) 
        : base(message)
    {
        Expected = expected;
        Actual = actual;
    }
}
