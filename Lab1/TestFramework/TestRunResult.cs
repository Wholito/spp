namespace TestFramework;


public class TestRunResult
{
    public IReadOnlyList<TestResult> Results { get; set; } = Array.Empty<TestResult>();
    public int TotalCount => Results.Count;
    public int PassedCount => Results.Count(r => r.Passed);
    public int FailedCount => Results.Count(r => !r.Passed);
    public TimeSpan TotalDuration { get; set; }
}
