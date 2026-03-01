namespace TestFramework.Attributes;


[AttributeUsage(AttributeTargets.Method)]
public class TestWithDescriptionAttribute : Attribute
{
    public string Description { get; }

    public TestWithDescriptionAttribute(string description)
    {
        Description = description;
    }
}
