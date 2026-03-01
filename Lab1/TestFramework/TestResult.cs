namespace TestFramework;


public class TestResult
{
    public string TestName { get; set; } = string.Empty;
    public string? ClassName { get; set; }
    public string? Description { get; set; }
    public bool Passed { get; set; }
    public string? ErrorMessage { get; set; }
    public string? StackTrace { get; set; }
    public TimeSpan Duration { get; set; }
}
