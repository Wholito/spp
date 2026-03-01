namespace TestFramework.Attributes;


[AttributeUsage(AttributeTargets.Class)]
public class TestClassWithNameAttribute : Attribute
{
    public string Name { get; }

    public TestClassWithNameAttribute(string name)
    {
        Name = name;
    }
}
