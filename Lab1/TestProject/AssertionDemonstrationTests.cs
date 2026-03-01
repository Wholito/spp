using TestFramework;
using TestFramework.Attributes;

namespace TestProject;


[TestClass]
public class AssertionDemonstrationTests
{
    private static int _classContext;
    private int _instanceContext;

    [ClassSetup]
    public void ClassSetup()
    {
        _classContext = 100;  
    }

    [Setup]
    public void Setup()
    {
        _instanceContext = 42; 
    }

    [Teardown]
    public void Teardown()
    {
        _instanceContext = 0;  
    }

    [ClassTeardown]
    public void ClassTeardown()
    {
        _classContext = 0;  
    }

    [Test]
    public void IsNull_Check()
    {
        string? s = null;
        Assert.IsNull(s);  
    }

    [Test]
    public void IsNotNull_Check()
    {
        var s = "hello";
        Assert.IsNotNull(s); 
    }

    [Test]
    public void Context_SetupWasApplied()
    {
        Assert.AreEqual(42, _instanceContext);
    }

    [Test]
    public void Context_ClassSetupWasApplied()
    {
        Assert.AreEqual(100, _classContext);  
    }
}
