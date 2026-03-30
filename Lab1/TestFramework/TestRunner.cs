using System.Diagnostics;
using System.Reflection;
using TestFramework.Attributes;
using TestFramework.Exceptions;

namespace TestFramework;


public class TestRunner
{
    private readonly List<Assembly> _assemblies = new();

    public void AddAssembly(Assembly assembly)
    {
        _assemblies.Add(assembly);
    }

    public Task<TestRunResult> RunAsync() => RunAsync(null);

    public async Task<TestRunResult> RunAsync(TestRunnerOptions? options)
    {
        options ??= new TestRunnerOptions();
        var maxDop = Math.Max(1, options.MaxDegreeOfParallelism);

        var discovered = DiscoverTests();

        var classStates = new Dictionary<Type, ClassParallelState>();
        foreach (var g in discovered.GroupBy(t => t.TestClass))
            classStates[g.Key] = new ClassParallelState { Remaining = g.Count() };

        var results = new TestResult[discovered.Count];
        var sw = Stopwatch.StartNew();

        using var gate = new SemaphoreSlim(maxDop, maxDop);
        var tasks = discovered.Select(async test =>
        {
            await gate.WaitAsync().ConfigureAwait(false);
            var state = classStates[test.TestClass];
            try
            {
                await EnsureClassSetupAsync(test.TestClass, state).ConfigureAwait(false);
                results[test.Order] = await ExecuteTestAsync(
                    test.TestClass,
                    test.Method,
                    test.Description,
                    test.Parameters).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                results[test.Order] = new TestResult
                {
                    TestName = BuildTestName(test.TestClass, test.Method, test.Description, test.Parameters),
                    ClassName = test.TestClass.Name,
                    Description = test.Description,
                    Passed = false,
                    ErrorMessage = $"{ex.GetType().Name}: {ex.Message}"
                };
            }
            finally
            {
                if (Interlocked.Decrement(ref state.Remaining) == 0)
                    await RunClassTeardownAsync(test.TestClass).ConfigureAwait(false);
                gate.Release();
            }
        }).ToArray();

        await Task.WhenAll(tasks).ConfigureAwait(false);
        sw.Stop();

        return new TestRunResult
        {
            Results = results,
            TotalDuration = sw.Elapsed
        };
    }

    private sealed class ClassParallelState
    {
        public int Remaining;
        public readonly object SetupLock = new();
        public Task? SetupTask;
    }

    private static async Task EnsureClassSetupAsync(Type testClass, ClassParallelState state)
    {
        Task task;
        lock (state.SetupLock)
        {
            state.SetupTask ??= RunClassSetupAsync(testClass);
            task = state.SetupTask;
        }

        await task.ConfigureAwait(false);
    }

    private sealed record DiscoveredTest(int Order, Type TestClass, MethodInfo Method, string? Description, object[]? Parameters);

    private List<DiscoveredTest> DiscoverTests()
    {
        var tests = new List<DiscoveredTest>();
        var order = 0;

        foreach (var assembly in _assemblies)
        {
            var testTypes = assembly.GetTypes()
                .Where(t => t.GetCustomAttribute<TestClassAttribute>() != null ||
                            t.GetCustomAttribute<TestClassWithNameAttribute>() != null);

            foreach (var type in testTypes)
            {
                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.DeclaringType == type);

                foreach (var method in methods)
                {
                    var testAttr = method.GetCustomAttribute<TestAttribute>();
                    var testDescAttr = method.GetCustomAttribute<TestWithDescriptionAttribute>();
                    var testParamsAttr = method.GetCustomAttribute<TestWithParametersAttribute>();

                    if (testAttr != null)
                    {
                        tests.Add(new DiscoveredTest(order++, type, method, null, null));
                    }
                    else if (testDescAttr != null)
                    {
                        tests.Add(new DiscoveredTest(order++, type, method, testDescAttr.Description, null));
                    }
                    else if (testParamsAttr != null)
                    {
                        foreach (var paramSet in GetParameterSets(testParamsAttr.Parameters, method))
                        {
                            tests.Add(new DiscoveredTest(order++, type, method, null, paramSet));
                        }
                    }
                }
            }
        }

        return tests;
    }

    private static IEnumerable<object[]> GetParameterSets(object[] parameters, MethodInfo method)
    {
        if (parameters.Length == 0)
        {
            yield return Array.Empty<object>();
            yield break;
        }

        var paramInfo = method.GetParameters();
        if (paramInfo.Length == 0)
        {
            yield return Array.Empty<object>();
            yield break;
        }

        yield return parameters;
    }

    private async Task<TestResult> ExecuteTestAsync(
        Type testClass,
        MethodInfo testMethod,
        string? description,
        object[]? parameters)
    {
        var timeoutAttr = testMethod.GetCustomAttribute<TestTimeoutAttribute>();
        var timeoutMs = timeoutAttr?.Milliseconds;
        if (timeoutMs is null or <= 0)
            return await ExecuteTestCoreAsync(testClass, testMethod, description, parameters).ConfigureAwait(false);

        var coreTask = Task.Run(() => ExecuteTestCoreAsync(testClass, testMethod, description, parameters));
        var delayTask = Task.Delay(timeoutMs.Value);
        var winner = await Task.WhenAny(coreTask, delayTask).ConfigureAwait(false);
        if (winner != coreTask)
        {
            var testName = BuildTestName(testClass, testMethod, description, parameters);
            return new TestResult
            {
                TestName = testName,
                ClassName = testClass.Name,
                Description = description,
                Passed = false,
                TimedOut = true,
                ErrorMessage = $"Превышено время ожидания теста ({timeoutMs} мс).",
                Duration = TimeSpan.FromMilliseconds(timeoutMs.Value)
            };
        }

        return await coreTask.ConfigureAwait(false);
    }

    private static string BuildTestName(Type testClass, MethodInfo testMethod, string? description, object[]? parameters)
    {
        var testName = $"{testClass.Name}.{testMethod.Name}";
        if (!string.IsNullOrEmpty(description))
            testName += $" - {description}";
        if (parameters != null && parameters.Length > 0)
            testName += $" [{string.Join(", ", parameters)}]";
        return testName;
    }

    private async Task<TestResult> ExecuteTestCoreAsync(
        Type testClass,
        MethodInfo testMethod,
        string? description,
        object[]? parameters)
    {
        var testName = BuildTestName(testClass, testMethod, description, parameters);
        var sw = Stopwatch.StartNew();
        object? instance = null;

        try
        {
            instance = Activator.CreateInstance(testClass);
            if (instance == null)
                throw new TestFailureException($"Failed to create instance of {testClass.Name}");

            await RunSetupAsync(testClass, instance).ConfigureAwait(false);
            try
            {
                var returnValue = InvokeMethod(instance, testMethod, parameters);
                if (returnValue is Task task)
                {
                    await task.ConfigureAwait(false);
                }

                sw.Stop();
                return new TestResult
                {
                    TestName = testName,
                    ClassName = testClass.Name,
                    Description = description,
                    Passed = true,
                    Duration = sw.Elapsed
                };
            }
            finally
            {
                await RunTeardownAsync(testClass, instance).ConfigureAwait(false);
            }
        }
        catch (AssertionFailedException ex)
        {
            sw.Stop();
            return new TestResult
            {
                TestName = testName,
                ClassName = testClass.Name,
                Description = description,
                Passed = false,
                ErrorMessage = ex.Message,
                StackTrace = ex.StackTrace,
                Duration = sw.Elapsed
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new TestResult
            {
                TestName = testName,
                ClassName = testClass.Name,
                Description = description,
                Passed = false,
                ErrorMessage = $"{ex.GetType().Name}: {ex.Message}",
                StackTrace = ex.StackTrace,
                Duration = sw.Elapsed
            };
        }
    }

    private object? InvokeMethod(object instance, MethodInfo method, object[]? parameters)
    {
        var paramInfo = method.GetParameters();
        var args = parameters ?? Array.Empty<object>();

        if (paramInfo.Length != args.Length && paramInfo.Length > 0)
            args = args.Length > 0 ? args : new object[] { paramInfo.Length == 1 ? CreateDefault(paramInfo[0].ParameterType)! : args };

        return method.Invoke(instance, args.Length > 0 ? args : null);
    }

    private static object? CreateDefault(Type type)
    {
        return type.IsValueType ? Activator.CreateInstance(type) : null;
    }

    private async Task RunSetupAsync(Type testClass, object instance)
    {
        await RunMethodAsync(testClass, instance, typeof(SetupAttribute)).ConfigureAwait(false);
    }

    private async Task RunTeardownAsync(Type testClass, object instance)
    {
        await RunMethodAsync(testClass, instance, typeof(TeardownAttribute)).ConfigureAwait(false);
    }

    private static async Task RunClassSetupAsync(Type testClass)
    {
        var instance = Activator.CreateInstance(testClass);
        if (instance != null)
            await RunMethodAsyncStatic(testClass, instance, typeof(ClassSetupAttribute)).ConfigureAwait(false);
    }

    private static async Task RunClassTeardownAsync(Type testClass)
    {
        var instance = Activator.CreateInstance(testClass);
        if (instance != null)
            await RunMethodAsyncStatic(testClass, instance, typeof(ClassTeardownAttribute)).ConfigureAwait(false);
    }

    private static async Task RunMethodAsyncStatic(Type testClass, object instance, Type attributeType)
    {
        var method = testClass.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m => m.GetCustomAttribute(attributeType) != null && m.DeclaringType == testClass);
        if (method == null) return;

        var result = method.Invoke(instance, null);
        if (result is Task t)
            await t.ConfigureAwait(false);
    }

    private async Task RunMethodAsync(Type testClass, object instance, Type attributeType)
    {
        await RunMethodAsyncStatic(testClass, instance, attributeType).ConfigureAwait(false);
    }
}
