using TestFramework;

var testAssembly = typeof(TestProject.CalculatorTests).Assembly;
var parallelDop = Math.Max(4, Environment.ProcessorCount);

Console.WriteLine(" ЛР 2: сравнение времени выполнения\n");

var runnerSeq = new TestRunner();
runnerSeq.AddAssembly(testAssembly);
var sequential = await runnerSeq.RunAsync(new TestRunnerOptions { MaxDegreeOfParallelism = 1 });

var runnerPar = new TestRunner();
runnerPar.AddAssembly(testAssembly);
var parallel = await runnerPar.RunAsync(new TestRunnerOptions { MaxDegreeOfParallelism = parallelDop });

Console.WriteLine($"Последовательно (MaxDegreeOfParallelism = 1): {sequential.TotalDuration.TotalMilliseconds:F1} мс");
Console.WriteLine($"Параллельно (MaxDegreeOfParallelism = {parallelDop}): {parallel.TotalDuration.TotalMilliseconds:F1} мс");
Console.WriteLine("Результаты тестов (параллельный прогон)\n");

foreach (var r in parallel.Results)
{
    if (r.TimedOut)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.Write("[FAIL] ");
        Console.ResetColor();
        Console.WriteLine($"{r.TestName} ({r.Duration.TotalMilliseconds:F1} мс)");
        Console.ForegroundColor = ConsoleColor.DarkRed;
        Console.WriteLine($"       TimeoutException: {r.ErrorMessage}");
        Console.ResetColor();
        continue;
    }

    var status = r.Passed ? "PASS" : "FAIL";
    var color = r.Passed ? ConsoleColor.Green : ConsoleColor.Red;
    Console.ForegroundColor = color;
    Console.Write($"[{status}] ");
    Console.ResetColor();
    Console.WriteLine($"{r.TestName} ({r.Duration.TotalMilliseconds:F1} мс)");
    if (!r.Passed && !string.IsNullOrEmpty(r.ErrorMessage))
    {
        Console.ForegroundColor = ConsoleColor.DarkRed;
        Console.WriteLine($"       {r.ErrorMessage}");
        if (!string.IsNullOrEmpty(r.StackTrace))
            Console.WriteLine(r.StackTrace.Split('\n')[0].Trim());
        Console.ResetColor();
    }
}

Console.WriteLine("\nИтоги");
Console.WriteLine($"Всего: {parallel.TotalCount}, Успешно: {parallel.PassedCount}, Провалено: {parallel.FailedCount}");
Console.WriteLine($"Время прогона (параллельно): {parallel.TotalDuration.TotalMilliseconds:F1} мс");

var outputPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test-results.txt");
await File.WriteAllTextAsync(outputPath, FormatResults(parallel));
Console.WriteLine($"\nРезультаты сохранены в: {outputPath}");

return parallel.FailedCount > 0 ? 1 : 0;

static string FormatResults(TestRunResult result)
{
    var sb = new System.Text.StringBuilder();
    sb.AppendLine("Результаты тестирования");
    sb.AppendLine($"Время: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
    sb.AppendLine();
    foreach (var r in result.Results)
    {
        var label = r.Passed ? "PASS" : "FAIL";
        sb.AppendLine($"[{label}] {r.TestName}");
        if (!string.IsNullOrEmpty(r.ErrorMessage))
            sb.AppendLine($"  Ошибка: {(r.TimedOut ? $"TimeoutException: {r.ErrorMessage}" : r.ErrorMessage)}");
    }

    sb.AppendLine();
    sb.AppendLine($"Всего: {result.TotalCount}, Успешно: {result.PassedCount}, Провалено: {result.FailedCount}");
    sb.AppendLine($"Время выполнения: {result.TotalDuration.TotalMilliseconds:F1} мс");
    return sb.ToString();
}
