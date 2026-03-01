using SampleProject;
using TestFramework;
using TestFramework.Attributes;

namespace TestProject;


[TestClass]
public class CalculatorTests
{
    private Calculator? _calculator;
    private int _setupCount;

    [Setup]
    public void Setup()
    {
        _calculator = new Calculator();
        _setupCount++;
    }

    [Teardown]
    public void Teardown()
    {
        _calculator = null;
    }

    [Test]
    public void Add_ReturnsSum()
    {
        Assert.IsNotNull(_calculator);
        var result = _calculator.Add(2, 3);
        Assert.AreEqual(5, result);  
    }

    [Test]
    public void Subtract_ReturnsDifference()
    {
        Assert.IsNotNull(_calculator);
        var result = _calculator.Subtract(10, 4);
        Assert.AreEqual(6, result);
        Assert.AreNotEqual(5, result);  
    }

    [TestWithDescription("Проверка умножения")]
    public void Multiply_ReturnsProduct()
    {
        Assert.IsNotNull(_calculator);
        var result = _calculator.Multiply(3, 4);
        Assert.IsTrue(result == 12);  
        Assert.IsFalse(result != 12);  
    }

    [Test]
    public void Divide_ByNonZero_ReturnsQuotient()
    {
        Assert.IsNotNull(_calculator);
        var result = _calculator.Divide(10, 2);
        Assert.GreaterThan(result, 4); 
        Assert.LessThan(result, 6);    
    }

    [Test]
    public void Divide_ByZero_ThrowsException()
    {
        Assert.IsNotNull(_calculator);
        Assert.Throws<DivideByZeroException>(() => _calculator.Divide(10, 0));  
    }

    [Test]
    public async Task AddAsync_ReturnsSum()
    {
        Assert.IsNotNull(_calculator);
        var result = await _calculator.AddAsync(7, 8);
        Assert.AreEqual(15, result);
    }

    [Test]
    public async Task DivideAsync_ByZero_Throws()
    {
        Assert.IsNotNull(_calculator);
        await Assert.ThrowsAsync<ArgumentException>(async () =>
            await _calculator.DivideAsync(10, 0));  
    }

    [Test]
    public void Setup_WasCalled()
    {
        Assert.IsNotNull(_calculator);
        Assert.GreaterThan(_setupCount, 0);
    }
}
