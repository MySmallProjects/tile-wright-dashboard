using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Tilewright.Addons.BuiltIn;

public static partial class DurationParser
{
    [GeneratedRegex(@"^\s*(\d+)\s*([smhd]?)\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex Pattern();

    public static TimeSpan Parse(string? raw, TimeSpan fallback, TimeSpan? min = null)
    {
        if (string.IsNullOrWhiteSpace(raw)) return fallback;
        var m = Pattern().Match(raw);
        if (!m.Success || !int.TryParse(m.Groups[1].Value, out var val) || val <= 0) return fallback;

        var unit = m.Groups[2].Value.ToLowerInvariant();
        var span = unit switch
        {
            "s" => TimeSpan.FromSeconds(val),
            "m" => TimeSpan.FromMinutes(val),
            "h" => TimeSpan.FromHours(val),
            "d" => TimeSpan.FromDays(val),
            _ => TimeSpan.FromSeconds(val)
        };

        if (min.HasValue && span < min.Value) return min.Value;
        return span;
    }
}

public static class JsonPathExtractor
{
    /// <summary>
    /// Extracts a value from a JsonElement using dot and bracket notation
    /// (e.g. "chart.result[0].meta.regularMarketPrice" or "price.gbp").
    /// </summary>
    public static JsonElement? Extract(JsonElement root, string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return root;

        var current = root;
        var clean = path.Trim().TrimStart('$', '.');
        var segments = clean.Split('.', StringSplitOptions.RemoveEmptyEntries);

        foreach (var rawSeg in segments)
        {
            var seg = rawSeg;
            // Handle property[index] or [index]
            while (seg.Length > 0)
            {
                var bracketIdx = seg.IndexOf('[');
                if (bracketIdx == 0)
                {
                    var closeIdx = seg.IndexOf(']');
                    if (closeIdx < 0) return null;
                    if (!int.TryParse(seg[1..closeIdx], out var idx)) return null;
                    if (current.ValueKind != JsonValueKind.Array || idx < 0 || idx >= current.GetArrayLength())
                        return null;
                    current = current[idx];
                    seg = seg[(closeIdx + 1)..];
                }
                else
                {
                    var propName = bracketIdx > 0 ? seg[..bracketIdx] : seg;
                    if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(propName, out var next))
                        return null;
                    current = next;
                    seg = bracketIdx > 0 ? seg[bracketIdx..] : string.Empty;
                }
            }
        }

        return current;
    }
}

public sealed record ColourRule(
    string Operator,
    string Threshold,
    string SemanticState,
    string? CustomColour = null);

public sealed record ColourRuleMatch(string SemanticState, string? CustomColour);

public static class ColourRuleEvaluator
{
    /// <summary>
    /// Evaluates colour rules in order; the last matching rule wins so progressive
    /// thresholds (e.g. "> 150 warning", "> 300 critical") behave intuitively.
    /// </summary>
    public static ColourRuleMatch Evaluate(string? rawValue, IEnumerable<ColourRule>? rules)
    {
        var result = new ColourRuleMatch("normal", null);
        if (string.IsNullOrWhiteSpace(rawValue) || rules is null) return result;

        var isNumeric = double.TryParse(rawValue, NumberStyles.Float, CultureInfo.InvariantCulture, out var numVal);

        foreach (var rule in rules)
        {
            if (string.IsNullOrWhiteSpace(rule.Operator) || string.IsNullOrWhiteSpace(rule.Threshold))
                continue;

            var matched = false;
            var op = rule.Operator.Trim();

            if (isNumeric && double.TryParse(rule.Threshold, NumberStyles.Float, CultureInfo.InvariantCulture, out var thresh))
            {
                matched = op switch
                {
                    ">" => numVal > thresh,
                    ">=" => numVal >= thresh,
                    "<" => numVal < thresh,
                    "<=" => numVal <= thresh,
                    "==" or "=" => Math.Abs(numVal - thresh) < 1e-9,
                    "!=" => Math.Abs(numVal - thresh) >= 1e-9,
                    _ => false
                };
            }
            else
            {
                matched = op switch
                {
                    "==" or "=" => string.Equals(rawValue.Trim(), rule.Threshold.Trim(), StringComparison.OrdinalIgnoreCase),
                    "!=" => !string.Equals(rawValue.Trim(), rule.Threshold.Trim(), StringComparison.OrdinalIgnoreCase),
                    _ => false
                };
            }

            if (matched)
            {
                var state = string.IsNullOrWhiteSpace(rule.SemanticState) ? "normal" : rule.SemanticState.Trim().ToLowerInvariant();
                var custom = string.IsNullOrWhiteSpace(rule.CustomColour) ? null : rule.CustomColour.Trim();
                result = new ColourRuleMatch(state, custom);
            }
        }

        return result;
    }
}
