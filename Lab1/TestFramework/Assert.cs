using TestFramework.Exceptions;

namespace TestFramework;


public static class Assert
{

    public static void AreEqual<T>(T expected, T actual, string? message = null)
    {
        if (!Equals(expected, actual))
            throw new AssertionFailedException(
                message ?? $"Expected: {expected}, Actual: {actual}",
                expected?.ToString(),
                actual?.ToString());
    }


    public static void AreNotEqual<T>(T expected, T actual, string? message = null)
    {
        if (Equals(expected, actual))
            throw new AssertionFailedException(
                message ?? $"Values should not be equal. Both: {expected}");
    }


    public static void IsTrue(bool condition, string? message = null)
    {
        if (!condition)
            throw new AssertionFailedException(
                message ?? "Expected condition to be true, but it was false.",
                "true",
                "false");
    }

    public static void IsFalse(bool condition, string? message = null)
    {
        if (condition)
            throw new AssertionFailedException(
                message ?? "Expected condition to be false, but it was true.",
                "false",
                "true");
    }

    public static void IsNull(object? value, string? message = null)
    {
        if (value != null)
            throw new AssertionFailedException(
                message ?? $"Expected null, but was: {value}");
    }


    public static void IsNotNull(object? value, string? message = null)
    {
        if (value == null)
            throw new AssertionFailedException(message ?? "Expected non-null value.");
    }


    public static void GreaterThan<T>(T actual, T expected, string? message = null)
        where T : IComparable<T>
    {
        if (actual.CompareTo(expected) <= 0)
            throw new AssertionFailedException(
                message ?? $"Expected {actual} to be greater than {expected}",
                expected.ToString(),
                actual.ToString());
    }


    public static void LessThan<T>(T actual, T expected, string? message = null)
        where T : IComparable<T>
    {
        if (actual.CompareTo(expected) >= 0)
            throw new AssertionFailedException(
                message ?? $"Expected {actual} to be less than {expected}",
                expected.ToString(),
                actual.ToString());
    }


    public static void Contains<T>(IEnumerable<T> collection, T element, string? message = null)
    {
        if (collection == null || !collection.Contains(element))
            throw new AssertionFailedException(
                message ?? $"Collection does not contain: {element}");
    }

    public static void DoesNotContain<T>(IEnumerable<T> collection, T element, string? message = null)
    {
        if (collection != null && collection.Contains(element))
            throw new AssertionFailedException(
                message ?? $"Collection should not contain: {element}");
    }


    public static void Contains(string actual, string substring, string? message = null)
    {
        if (string.IsNullOrEmpty(actual) || !actual.Contains(substring))
            throw new AssertionFailedException(
                message ?? $"String '{actual}' does not contain '{substring}'");
    }


    public static void Throws<TException>(Action action, string? message = null)
        where TException : Exception
    {
        try
        {
            action();
            throw new AssertionFailedException(
                message ?? $"Expected exception of type {typeof(TException).Name} was not thrown.");
        }
        catch (TException)
        {

        }
        catch (AssertionFailedException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new AssertionFailedException(
                message ?? $"Expected {typeof(TException).Name}, but got {ex.GetType().Name}: {ex.Message}");
        }
    }


    public static async Task ThrowsAsync<TException>(Func<Task> action, string? message = null)
        where TException : Exception
    {
        try
        {
            await action();
            throw new AssertionFailedException(
                message ?? $"Expected exception of type {typeof(TException).Name} was not thrown.");
        }
        catch (TException)
        {

        }
        catch (AssertionFailedException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new AssertionFailedException(
                message ?? $"Expected {typeof(TException).Name}, but got {ex.GetType().Name}: {ex.Message}");
        }
    }


    public static void IsEmpty<T>(IEnumerable<T> collection, string? message = null)
    {
        if (collection != null && collection.Any())
            throw new AssertionFailedException(
                message ?? "Collection is not empty.");
    }


    public static void IsNotEmpty<T>(IEnumerable<T> collection, string? message = null)
    {
        if (collection == null || !collection.Any())
            throw new AssertionFailedException(message ?? "Collection is empty.");
    }
}
