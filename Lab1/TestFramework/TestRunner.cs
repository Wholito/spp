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

    private readonly HashSet<Type> _classSetupExecuted = new();


    public async Task<TestRunResult> RunAsync()
    {
        var tests = DiscoverTests();
        var results = new List<TestResult>();
        var sw = Stopwatch.StartNew();
        _classSetupExecuted.Clear();

        var testsByClass = tests.GroupBy(t => t.TestClass).ToList();
        for (int i = 0; i < testsByClass.Count; i++)
        {
            var group = testsByClass[i];
            var testClass = group.Key;
            var testList = group.ToList();
            var isLastClass = (i == testsByClass.Count - 1);

            if (!_classSetupExecuted.Contains(testClass))
            {
                _classSetupExecuted.Add(testClass);
                await RunClassSetupAsync(testClass);
            }

            for (int j = 0; j < testList.Count; j++)
            {
                var (tc, tm, desc, pars) = testList[j];
                var result = await ExecuteTestAsync(tc, tm, desc, pars);
                results.Add(result);
            }

            await RunClassTeardownAsync(testClass);
        }

        sw.Stop();
        return new TestRunResult
        {
            Results = results,
            TotalDuration = sw.Elapsed
        };
    }

    private List<(Type TestClass, MethodInfo Method, string? Description, object[]? Parameters)> DiscoverTests()
    {
        var tests = new List<(Type, MethodInfo, string?, object[]?)>();

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
                        tests.Add((type, method, null, null));
                    }
                    else if (testDescAttr != null)
                    {
                        tests.Add((type, method, testDescAttr.Description, null));
                    }
                    else if (testParamsAttr != null)
                    {
                        foreach (var paramSet in GetParameterSets(testParamsAttr.Parameters, method))
                        {
                            tests.Add((type, method, null, paramSet));
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
        var testName = $"{testClass.Name}.{testMethod.Name}";
        if (!string.IsNullOrEmpty(description))
            testName += $" - {description}";
        if (parameters != null && parameters.Length > 0)
            testName += $" [{string.Join(", ", parameters)}]";

        var sw = Stopwatch.StartNew();
        object? instance = null;

        try
        {
            instance = Activator.CreateInstance(testClass);
            if (instance == null)
                throw new TestFailureException($"Failed to create instance of {testClass.Name}");

            await RunSetupAsync(testClass, instance);
            try
            {
                var returnValue = InvokeMethod(instance, testMethod, parameters);
                if (returnValue is Task task)
                {
                    await task;
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
                await RunTeardownAsync(testClass, instance);
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
            args = args.Length > 0 ? args : new object[] { paramInfo.Length == 1 ? CreateDefault(paramInfo[0].ParameterType) : args };

        return method.Invoke(instance, args.Length > 0 ? args : null);
    }

    private static object? CreateDefault(Type type)
    {
        return type.IsValueType ? Activator.CreateInstance(type) : null;
    }

    private async Task RunSetupAsync(Type testClass, object instance)
    {
        await RunMethodAsync(testClass, instance, typeof(SetupAttribute));
    }

    private async Task RunTeardownAsync(Type testClass, object instance)
    {
        await RunMethodAsync(testClass, instance, typeof(TeardownAttribute));
    }

    private async Task RunClassSetupAsync(Type testClass)
    {
        var instance = Activator.CreateInstance(testClass);
        if (instance != null)
            await RunMethodAsync(testClass, instance, typeof(ClassSetupAttribute));
    }

    private async Task RunClassTeardownAsync(Type testClass)
    {
        var instance = Activator.CreateInstance(testClass);
        if (instance != null)
            await RunMethodAsync(testClass, instance, typeof(ClassTeardownAttribute));
    }

    private async Task RunMethodAsync(Type testClass, object instance, Type attributeType)
    {
        var method = testClass.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m => m.GetCustomAttribute(attributeType) != null && m.DeclaringType == testClass);
        if (method == null) return;

        var result = method.Invoke(instance, null);
        if (result is Task t)
            await t;
    }
}
