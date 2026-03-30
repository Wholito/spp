namespace TestFramework.Attributes;


[AttributeUsage(AttributeTargets.Method)]
public sealed class TestTimeoutAttribute : Attribute
{
    public int Milliseconds { get; }

    public TestTimeoutAttribute(int milliseconds)
    {
        Milliseconds = milliseconds;
    }
}
