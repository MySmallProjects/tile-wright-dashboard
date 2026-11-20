using System.Text.Json;
using Tilewright.Addons.BuiltIn;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class AddonHelpersTests
{
    [Fact]
    public void ColourRuleEvaluator_EvaluatesProgressiveNumericThresholdsAndCustomColour()
    {
        var rules = new[]
        {
            new ColourRule(">", "150", "warning", null),
            new ColourRule(">", "300", "critical", "#ff00aa")
        };

        var low = ColourRuleEvaluator.Evaluate("80", rules);
        Assert.Equal("normal", low.SemanticState);
        Assert.Null(low.CustomColour);

        var mid = ColourRuleEvaluator.Evaluate("210.5", rules);
        Assert.Equal("warning", mid.SemanticState);
        Assert.Null(mid.CustomColour);

        var high = ColourRuleEvaluator.Evaluate("350", rules);
        Assert.Equal("critical", high.SemanticState);
        Assert.Equal("#ff00aa", high.CustomColour);
    }

    [Fact]
    public void ColourRuleEvaluator_SupportsStringEquality()
    {
        var rules = new[]
        {
            new ColourRule("==", "open", "warning", null),
            new ColourRule("==", "alarm", "critical", null)
        };

        Assert.Equal("warning", ColourRuleEvaluator.Evaluate("OPEN", rules).SemanticState);
        Assert.Equal("critical", ColourRuleEvaluator.Evaluate("alarm", rules).SemanticState);
        Assert.Equal("normal", ColourRuleEvaluator.Evaluate("closed", rules).SemanticState);
    }

    [Fact]
    public void JsonPathExtractor_ExtractsNestedObjectAndArrayValues()
    {
        using var doc = JsonDocument.Parse("""
        {
          "chart": {
            "result": [
              { "meta": { "regularMarketPrice": 412.75 } }
            ]
          }
        }
        """);

        var val = JsonPathExtractor.Extract(doc.RootElement, "chart.result[0].meta.regularMarketPrice");
        Assert.NotNull(val);
        Assert.Equal(412.75, val.Value.GetDouble(), precision: 2);

        Assert.Null(JsonPathExtractor.Extract(doc.RootElement, "chart.result[5].meta.regularMarketPrice"));
    }

    [Fact]
    public void DurationParser_ParsesUnitsAndClampsMinimum()
    {
        Assert.Equal(TimeSpan.FromHours(2), DurationParser.Parse("2h", TimeSpan.FromMinutes(1)));
        Assert.Equal(TimeSpan.FromMinutes(15), DurationParser.Parse("15m", TimeSpan.FromMinutes(1)));
        Assert.Equal(TimeSpan.FromSeconds(5), DurationParser.Parse("5s", TimeSpan.FromMinutes(1)));
        Assert.Equal(TimeSpan.FromSeconds(10), DurationParser.Parse("2s", TimeSpan.FromMinutes(1), TimeSpan.FromSeconds(10)));
        Assert.Equal(TimeSpan.FromMinutes(5), DurationParser.Parse("invalid", TimeSpan.FromMinutes(5)));
    }
}
