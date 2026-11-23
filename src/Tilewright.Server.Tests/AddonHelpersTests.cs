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

    [Fact]
    public void ApiValueFormatting_AppliesDotNetNumberFormats()
    {
        Assert.Equal("10,000", ApiValueAddonModule.FormatNumericValue("10000", "#,##0", 2));
        Assert.Equal("12,345.68", ApiValueAddonModule.FormatNumericValue("12345.678", "#,##0.00", 0));
        Assert.Equal("10,000", ApiValueAddonModule.FormatNumericValue("10000", "N0", 2));
        Assert.Equal("42.50", ApiValueAddonModule.FormatNumericValue("42.5", null, 2));
        Assert.Equal("online", ApiValueAddonModule.FormatNumericValue("online", "#,##0", 2));
    }

    [Fact]
    public void ApiValueChange_FormatsToOneDecimalDroppingTrailingZeroAndSign()
    {
        Assert.Equal("0.7", ApiValueAddonModule.FormatChangeValue(0.6822144840730399));
        Assert.Equal("2", ApiValueAddonModule.FormatChangeValue(2.0));
        Assert.Equal("2", ApiValueAddonModule.FormatChangeValue(-2.04));
        Assert.Equal("1.5", ApiValueAddonModule.FormatChangeValue(-1.54));
        Assert.Equal("0", ApiValueAddonModule.FormatChangeValue(0));
    }

    [Fact]
    public void ApiValueChange_ExtractsValidAndWarnsOnInvalidOrMissing()
    {
        using var root = JsonDocument.Parse("""
        {
          "stock": {
            "pos": 0.6822144840730399,
            "neg": -2.0,
            "strNum": "-1.25",
            "bad": "N/A"
          }
        }
        """);

        using var emptyCfg = JsonDocument.Parse("""{ "priceJson": "stock.pos", "changeJson": "" }""");
        var empty = ApiValueAddonModule.ExtractChange(root.RootElement, emptyCfg.RootElement);
        Assert.Null(empty.Value);
        Assert.Null(empty.Display);
        Assert.Null(empty.Warning);

        using var posCfg = JsonDocument.Parse("""{ "changeJson": "stock.pos" }""");
        var pos = ApiValueAddonModule.ExtractChange(root.RootElement, posCfg.RootElement);
        Assert.Equal(0.6822144840730399, pos.Value!.Value, precision: 6);
        Assert.Equal("0.7", pos.Display);
        Assert.Null(pos.Warning);

        using var negCfg = JsonDocument.Parse("""{ "changeJson": "stock.neg" }""");
        var neg = ApiValueAddonModule.ExtractChange(root.RootElement, negCfg.RootElement);
        Assert.Equal(-2.0, neg.Value!.Value, precision: 6);
        Assert.Equal("2", neg.Display);
        Assert.Null(neg.Warning);

        using var strCfg = JsonDocument.Parse("""{ "changeJson": "stock.strNum" }""");
        var str = ApiValueAddonModule.ExtractChange(root.RootElement, strCfg.RootElement);
        Assert.Equal(-1.25, str.Value!.Value, precision: 6);
        Assert.Equal("1.3", str.Display);
        Assert.Null(str.Warning);

        using var missingCfg = JsonDocument.Parse("""{ "changeJson": "stock.missing" }""");
        var missing = ApiValueAddonModule.ExtractChange(root.RootElement, missingCfg.RootElement);
        Assert.Null(missing.Value);
        Assert.Null(missing.Display);
        Assert.Contains("not found", missing.Warning);

        using var badCfg = JsonDocument.Parse("""{ "changeJson": "stock.bad" }""");
        var bad = ApiValueAddonModule.ExtractChange(root.RootElement, badCfg.RootElement);
        Assert.Null(bad.Value);
        Assert.Null(bad.Display);
        Assert.Contains("\"N/A\"", bad.Warning);
    }

    [Fact]
    public void OpenMeteoHelpers_MapWmoCodesAndExtractTimes()
    {
        Assert.Equal(("Clear sky", "1.svg"), OpenMeteoAddonModule.MapWmoCode(0));
        Assert.Equal(("Partly cloudy", "3.svg"), OpenMeteoAddonModule.MapWmoCode(2));
        Assert.Equal(("Moderate rain", "10.svg"), OpenMeteoAddonModule.MapWmoCode(63));
        Assert.Equal(("Thunderstorm", "11.svg"), OpenMeteoAddonModule.MapWmoCode(95));
        Assert.Equal("07:30", OpenMeteoAddonModule.ExtractTimeHHmm("2026-11-20T07:30"));
    }
}
