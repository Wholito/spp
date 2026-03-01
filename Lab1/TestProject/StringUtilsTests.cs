using SampleProject;
using TestFramework;
using TestFramework.Attributes;

namespace TestProject;


[TestClassWithName("Тесты утилит строк")]
public class StringUtilsTests
{
    [Test]
    public void Reverse_ReturnsReversed()
    {
        var result = StringUtils.Reverse("hello");
        Assert.AreEqual("olleh", result);
    }

    [Test]
    public void Reverse_Null_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => StringUtils.Reverse(null!));
    }

    [Test]
    public void IsPalindrome_True_ForPalindrome()
    {
        Assert.IsTrue(StringUtils.IsPalindrome("radar"));
        Assert.IsTrue(StringUtils.IsPalindrome("A man a plan a canal Panama"));
    }

    [Test]
    public void IsPalindrome_False_ForNonPalindrome()
    {
        Assert.IsFalse(StringUtils.IsPalindrome("hello"));
    }

    [Test]
    public void SplitByComma_ReturnsParts()
    {
        var parts = StringUtils.SplitByComma("a, b, c");
        Assert.Contains(parts, "a");  
        Assert.Contains(parts, "b");
        Assert.Contains(parts, "c");
        Assert.IsNotEmpty(parts);     
    }

    [Test]
    public void SplitByComma_DoesNotContain_Other()
    {
        var parts = StringUtils.SplitByComma("a, b");
        Assert.DoesNotContain(parts, "c");  
    }

    [Test]
    public void SplitByComma_Null_ReturnsEmpty()
    {
        var parts = StringUtils.SplitByComma(null!);
        Assert.IsEmpty(parts);  
    }

    [TestWithParameters("test")]
    public void Reverse_WithParam(string input)
    {
        var result = StringUtils.Reverse(input);
        Assert.Contains(result, "t");  
    }
}
