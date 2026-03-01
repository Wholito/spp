namespace TestFramework.Attributes;


[AttributeUsage(AttributeTargets.Method)]
public class TestWithParametersAttribute : Attribute
{
    public object[] Parameters { get; }

    public TestWithParametersAttribute(params object[] parameters)
    {
        Parameters = parameters;
    }
}
