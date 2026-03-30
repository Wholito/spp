using TestFramework;
using TestFramework.Attributes;

namespace TestProject;


[TestClass]
public class ParallelLaboratoryTests
{
    [Test]
    public void ParallelDelay_01() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_02() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_03() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_04() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_05() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_06() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_07() => Thread.Sleep(120);

    [Test]
    public void ParallelDelay_08() => Thread.Sleep(120);

    [Test]
    [TestTimeout(200)]
    public void CompletesWithinTimeout()
    {
        Thread.Sleep(50);
    }

    [Test]
    [TestTimeout(80)]
    public void ExceedsTimeout_IsAbortedByFramework()
    {
        Thread.Sleep(300);
    }
}
