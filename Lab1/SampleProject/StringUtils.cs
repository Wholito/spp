namespace SampleProject;

public static class StringUtils
{
    public static string Reverse(string s)
    {
        if (s == null) throw new ArgumentNullException(nameof(s));
        return new string(s.Reverse().ToArray());
    }

    public static bool IsPalindrome(string s)
    {
        if (string.IsNullOrEmpty(s)) return true;
        var cleaned = new string(s.ToLower().Where(char.IsLetterOrDigit).ToArray());
        return cleaned == Reverse(cleaned);
    }

    public static string[] SplitByComma(string s) => s?.Split(',', StringSplitOptions.TrimEntries) ?? Array.Empty<string>();
}
