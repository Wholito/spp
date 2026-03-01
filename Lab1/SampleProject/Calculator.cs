namespace SampleProject;


public class Calculator
{
    public int Add(int a, int b) => a + b;
    public int Subtract(int a, int b) => a - b;
    public int Multiply(int a, int b) => a * b;
    public int Divide(int a, int b) => b == 0 ? throw new DivideByZeroException("Division by zero") : a / b;

    public async Task<int> AddAsync(int a, int b)
    {
        await Task.Delay(10);
        return a + b;
    }

    public async Task<double> DivideAsync(double a, double b)
    {
        await Task.Delay(10);
        if (Math.Abs(b) < 1e-10)
            throw new ArgumentException("Division by zero");
        return a / b;
    }
}
