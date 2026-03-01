using TestFramework;

var runner = new TestRunner();
runner.AddAssembly(typeof(TestProject.CalculatorTests).Assembly);

Console.WriteLine("=== Запуск тестов ===\n");

var result = await runner.RunAsync();

foreach (var r in result.Results)
{
    var status = r.Passed ? "PASS" : "FAIL";
    var color = r.Passed ? ConsoleColor.Green : ConsoleColor.Red;
    Console.ForegroundColor = color;
    Console.Write($"[{status}] ");
    Console.ResetColor();
    Console.WriteLine($"{r.TestName} ({r.Duration.TotalMilliseconds:F1} ms)");
    if (!r.Passed && !string.IsNullOrEmpty(r.ErrorMessage))
    {
        Console.ForegroundColor = ConsoleColor.DarkRed;
        Console.WriteLine($"       {r.ErrorMessage}");
        if (!string.IsNullOrEmpty(r.StackTrace))
            Console.WriteLine(r.StackTrace.Split('\n')[0].Trim());
        Console.ResetColor();
    }
}

Console.WriteLine("\n=== Итоги ===");
Console.WriteLine($"Всего: {result.TotalCount}, Успешно: {result.PassedCount}, Провалено: {result.FailedCount}");
Console.WriteLine($"Время: {result.TotalDuration.TotalMilliseconds:F1} ms");

var outputPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test-results.txt");
await File.WriteAllTextAsync(outputPath, FormatResults(result));
Console.WriteLine($"\nРезультаты сохранены в: {outputPath}");

return result.FailedCount > 0 ? 1 : 0;

static string FormatResults(TestRunResult result)
{
    var sb = new System.Text.StringBuilder();
    sb.AppendLine("=== Результаты тестирования ===");
    sb.AppendLine($"Время: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
    sb.AppendLine();
    foreach (var r in result.Results)
    {
        sb.AppendLine($"[{(r.Passed ? "PASS" : "FAIL")}] {r.TestName}");
        if (!r.Passed && !string.IsNullOrEmpty(r.ErrorMessage))
            sb.AppendLine($"  Ошибка: {r.ErrorMessage}");
    }
    sb.AppendLine();
    sb.AppendLine($"Всего: {result.TotalCount}, Успешно: {result.PassedCount}, Провалено: {result.FailedCount}");
    sb.AppendLine($"Время выполнения: {result.TotalDuration.TotalMilliseconds:F1} ms");
    return sb.ToString();
}
