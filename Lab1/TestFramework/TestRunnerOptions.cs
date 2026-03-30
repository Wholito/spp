namespace TestFramework;


public sealed class TestRunnerOptions
{
    public int MaxDegreeOfParallelism { get; set; } = Math.Max(1, Environment.ProcessorCount);
}
