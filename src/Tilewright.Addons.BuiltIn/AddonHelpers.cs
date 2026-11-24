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

/// <summary>
/// Shared power-user value formatter for numbers and ISO-8601 dates/timestamps.
/// Mirrors the client-side <c>valueFormatter.js</c> syntax so server and browser produce identical output.
/// </summary>
public static partial class ValueFormatter
{
    [GeneratedRegex(@"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$", RegexOptions.Compiled)]
    private static partial Regex StrictNumberRegex();

    [GeneratedRegex(@"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$", RegexOptions.Compiled)]
    private static partial Regex IsoDateRegex();

    [GeneratedRegex(@"^([NFP])(\d*)$", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex StandardNumberRegex();

    [GeneratedRegex(@"'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t|zzz|zz", RegexOptions.Compiled)]
    private static partial Regex DateTokenRegex();

    private static readonly CultureInfo EnGbCulture = CultureInfo.GetCultureInfo("en-GB");

    public static string Format(
        string? rawValue,
        string? formatString,
        TimeZoneInfo? timeZone = null,
        CultureInfo? culture = null,
        DateTimeOffset? now = null)
    {
        if (rawValue is null) return string.Empty;
        if (string.IsNullOrWhiteSpace(formatString)) return rawValue;

        var trimmedRaw = rawValue.Trim();

        // 1. Numeric value
        if (StrictNumberRegex().IsMatch(trimmedRaw) &&
            double.TryParse(trimmedRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out var num) &&
            double.IsFinite(num))
        {
            return FormatNumber(num, formatString);
        }

        // 2. ISO-8601 date/timestamp
        if (TryParseIsoDate(trimmedRaw, timeZone, out var zonedDto))
        {
            return FormatDate(zonedDto, formatString, culture ?? EnGbCulture, now ?? DateTimeOffset.UtcNow);
        }

        // 3. Passthrough for non-numeric, non-date strings ("unavailable", "home", etc.)
        return rawValue;
    }

    public static string FormatNumber(double num, string formatString)
    {
        if (string.IsNullOrWhiteSpace(formatString))
            return num.ToString(CultureInfo.InvariantCulture);

        var trimmed = formatString.Trim();

        // Standard .NET-style specifiers: N[d], F[d], P[d]
        var std = StandardNumberRegex().Match(trimmed);
        if (std.Success)
        {
            var code = char.ToUpperInvariant(std.Groups[1].Value[0]);
            var decimals = string.IsNullOrEmpty(std.Groups[2].Value)
                ? 2
                : Math.Min(20, int.Parse(std.Groups[2].Value, CultureInfo.InvariantCulture));
            var effective = code == 'P' ? num * 100.0 : num;
            var isNeg = effective < 0;
            var rounded = RoundHalfAwayFromZero(Math.Abs(effective), decimals);
            SplitDecimal(rounded, out var rawInt, out var rawFrac);
            var intPart = code is 'N' or 'P' ? AddGrouping(rawInt) : rawInt;
            var isEffectiveZero = IsZeroString(rounded);
            var sign = isNeg && !isEffectiveZero ? "-" : string.Empty;
            var body = rawFrac.Length > 0 ? $"{intPart}.{rawFrac}" : intPart;
            return code == 'P' ? $"{sign}{body}%" : $"{sign}{body}";
        }

        // Custom numeric pattern with optional prefix/suffix
        if (!TryExtractNumericPattern(formatString, out var prefix, out var intPattern, out var fracPattern, out var suffix))
        {
            return num.ToString(CultureInfo.InvariantCulture);
        }

        var useGrouping = intPattern.Contains(',');
        var cleanIntPat = intPattern.Replace(",", string.Empty, StringComparison.Ordinal);
        var minIntDigits = Math.Max(1, cleanIntPat.Count(c => c == '0'));

        var maxFracDigits = fracPattern.Length;
        var minFracDigits = 0;
        for (var i = 0; i < fracPattern.Length; i++)
        {
            if (fracPattern[i] == '0')
            {
                minFracDigits = i + 1;
            }
        }

        var neg = num < 0;
        var roundedStr = RoundHalfAwayFromZero(Math.Abs(num), maxFracDigits);
        SplitDecimal(roundedStr, out var intStr, out var fracStr);

        if (fracStr.Length > minFracDigits)
        {
            var end = fracStr.Length;
            while (end > minFracDigits && fracStr[end - 1] == '0')
            {
                end--;
            }
            fracStr = fracStr[..end];
        }

        if (intStr.Length < minIntDigits)
        {
            intStr = new string('0', minIntDigits - intStr.Length) + intStr;
        }

        if (useGrouping)
        {
            intStr = AddGrouping(intStr);
        }

        var zero = IsZeroString(roundedStr);
        var signStr = neg && !zero ? "-" : string.Empty;
        var formatted = fracStr.Length > 0 ? $"{intStr}.{fracStr}" : intStr;
        return $"{prefix}{signStr}{formatted}{suffix}";
    }

    private static bool TryExtractNumericPattern(
        string fmt,
        out string prefix,
        out string intPattern,
        out string fracPattern,
        out string suffix)
    {
        var prefixSb = new System.Text.StringBuilder();
        var coreSb = new System.Text.StringBuilder();
        var suffixSb = new System.Text.StringBuilder();
        var state = 0; // 0 = prefix, 1 = core, 2 = suffix
        var inQuote = false;

        for (var i = 0; i < fmt.Length; i++)
        {
            var ch = fmt[i];
            if (ch == '\'')
            {
                inQuote = !inQuote;
                continue;
            }

            if (inQuote)
            {
                if (state == 0) prefixSb.Append(ch);
                else
                {
                    state = 2;
                    suffixSb.Append(ch);
                }
                continue;
            }

            var isDigitPlaceholder = ch is '#' or '0';
            var isSeparator = ch is ',' or '.';

            if (state == 0)
            {
                if (isDigitPlaceholder || (ch == '.' && i + 1 < fmt.Length && fmt[i + 1] is '#' or '0'))
                {
                    state = 1;
                    coreSb.Append(ch);
                }
                else
                {
                    prefixSb.Append(ch);
                }
            }
            else if (state == 1)
            {
                if (isDigitPlaceholder || isSeparator)
                {
                    coreSb.Append(ch);
                }
                else
                {
                    state = 2;
                    suffixSb.Append(ch);
                }
            }
            else
            {
                suffixSb.Append(ch);
            }
        }

        var core = coreSb.ToString();
        if (!core.Contains('#') && !core.Contains('0'))
        {
            prefix = intPattern = fracPattern = suffix = string.Empty;
            return false;
        }

        var suffixStr = suffixSb.ToString();
        while (core.EndsWith('.') || core.EndsWith(','))
        {
            suffixStr = core[^1] + suffixStr;
            core = core[..^1];
        }

        var dotIdx = core.IndexOf('.');
        intPattern = dotIdx >= 0 ? core[..dotIdx] : core;
        fracPattern = dotIdx >= 0
            ? new string(core[(dotIdx + 1)..].Where(c => c is '#' or '0').ToArray())
            : string.Empty;
        prefix = prefixSb.ToString();
        suffix = suffixStr;
        return true;
    }

    private static string RoundHalfAwayFromZero(double absVal, int decimals)
    {
        var d = Math.Clamp(decimals, 0, 20);
        if (absVal == 0)
        {
            return d > 0 ? "0." + new string('0', d) : "0";
        }
        var rounded = Math.Round((decimal)absVal, d, MidpointRounding.AwayFromZero);
        return rounded.ToString($"F{d}", CultureInfo.InvariantCulture);
    }

    private static void SplitDecimal(string rounded, out string intPart, out string fracPart)
    {
        var dot = rounded.IndexOf('.');
        if (dot < 0)
        {
            intPart = rounded;
            fracPart = string.Empty;
        }
        else
        {
            intPart = rounded[..dot];
            fracPart = rounded[(dot + 1)..];
        }
    }

    private static bool IsZeroString(string s) => s.All(c => c is '0' or '.');

    private static string AddGrouping(string intStr)
    {
        if (intStr.Length <= 3) return intStr;
        var sb = new System.Text.StringBuilder(intStr.Length + intStr.Length / 3);
        var rem = intStr.Length % 3;
        if (rem > 0)
        {
            sb.Append(intStr, 0, rem);
        }
        for (var i = rem; i < intStr.Length; i += 3)
        {
            if (sb.Length > 0) sb.Append(',');
            sb.Append(intStr, i, 3);
        }
        return sb.ToString();
    }

    private static bool TryParseIsoDate(string raw, TimeZoneInfo? timeZone, out DateTimeOffset zoned)
    {
        zoned = default;
        var m = IsoDateRegex().Match(raw);
        if (!m.Success) return false;

        var tz = timeZone ?? TimeZoneInfo.Local;

        // Date-only (YYYY-MM-DD)
        if (!m.Groups[4].Success)
        {
            if (!int.TryParse(m.Groups[1].Value, out var year) ||
                !int.TryParse(m.Groups[2].Value, out var month) ||
                !int.TryParse(m.Groups[3].Value, out var day))
            {
                return false;
            }
            try
            {
                var localDate = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Unspecified);
                var offset = tz.GetUtcOffset(localDate);
                zoned = new DateTimeOffset(localDate, offset);
                return true;
            }
            catch (ArgumentOutOfRangeException)
            {
                return false;
            }
        }

        // Normalize space separator to 'T' and "+0100" to "+01:00"
        var normalized = raw.Replace(' ', 'T');
        if (m.Groups[8].Success && m.Groups[8].Value.Length == 5 && (m.Groups[8].Value[0] == '+' || m.Groups[8].Value[0] == '-'))
        {
            normalized = normalized[..^2] + ":" + normalized[^2..];
        }

        if (m.Groups[8].Success)
        {
            // Explicit offset or 'Z' -> convert exact instant to target timezone (DST/BST-aware)
            if (!DateTimeOffset.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto))
            {
                return false;
            }
            zoned = TimeZoneInfo.ConvertTime(dto, tz);
            return true;
        }

        // Local date-time with no offset -> treat as wall clock in target timezone
        if (!DateTime.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.None, out var unspecified))
        {
            return false;
        }
        var unspecifiedDt = DateTime.SpecifyKind(unspecified, DateTimeKind.Unspecified);
        zoned = new DateTimeOffset(unspecifiedDt, tz.GetUtcOffset(unspecifiedDt));
        return true;
    }

    private static string FormatDate(DateTimeOffset zoned, string formatString, CultureInfo culture, DateTimeOffset now)
    {
        if (string.Equals(formatString.Trim(), "relative", StringComparison.OrdinalIgnoreCase))
        {
            return FormatRelative(zoned - now);
        }

        var hour24 = zoned.Hour;
        var hour12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
        var ampm = hour24 < 12 ? "AM" : "PM";
        var off = zoned.Offset;
        var offSign = off < TimeSpan.Zero ? "-" : "+";
        var absOff = off.Duration();
        var offH = absOff.Hours.ToString("00", CultureInfo.InvariantCulture);
        var offM = absOff.Minutes.ToString("00", CultureInfo.InvariantCulture);

        return DateTokenRegex().Replace(formatString, match =>
        {
            if (match.Groups[1].Success) return match.Groups[1].Value;
            return match.Value switch
            {
                "yyyy" => zoned.Year.ToString("0000", CultureInfo.InvariantCulture),
                "yy" => (zoned.Year % 100).ToString("00", CultureInfo.InvariantCulture),
                "MMMM" => zoned.ToString("MMMM", culture),
                "MMM" => zoned.ToString("MMM", culture),
                "MM" => zoned.Month.ToString("00", CultureInfo.InvariantCulture),
                "M" => zoned.Month.ToString(CultureInfo.InvariantCulture),
                "dddd" => zoned.ToString("dddd", culture),
                "ddd" => zoned.ToString("ddd", culture),
                "dd" => zoned.Day.ToString("00", CultureInfo.InvariantCulture),
                "d" => zoned.Day.ToString(CultureInfo.InvariantCulture),
                "HH" => hour24.ToString("00", CultureInfo.InvariantCulture),
                "H" => hour24.ToString(CultureInfo.InvariantCulture),
                "hh" => hour12.ToString("00", CultureInfo.InvariantCulture),
                "h" => hour12.ToString(CultureInfo.InvariantCulture),
                "mm" => zoned.Minute.ToString("00", CultureInfo.InvariantCulture),
                "m" => zoned.Minute.ToString(CultureInfo.InvariantCulture),
                "ss" => zoned.Second.ToString("00", CultureInfo.InvariantCulture),
                "s" => zoned.Second.ToString(CultureInfo.InvariantCulture),
                "tt" => ampm,
                "t" => ampm[0].ToString(),
                "zzz" => $"{offSign}{offH}:{offM}",
                "zz" => $"{offSign}{offH}",
                _ => match.Value
            };
        });
    }

    private static string FormatRelative(TimeSpan diff)
    {
        var absSec = (long)Math.Round(Math.Abs(diff.TotalSeconds), MidpointRounding.AwayFromZero);
        if (absSec < 45) return "just now";

        var future = diff > TimeSpan.Zero;
        var totalMin = (long)Math.Round(absSec / 60.0, MidpointRounding.AwayFromZero);
        string text;
        if (totalMin < 60)
        {
            text = $"{totalMin}m";
        }
        else
        {
            var hours = totalMin / 60;
            var mins = totalMin % 60;
            if (hours < 24)
            {
                text = mins > 0 ? $"{hours}h {mins}m" : $"{hours}h";
            }
            else
            {
                var days = hours / 24;
                var remHours = hours % 24;
                text = remHours > 0 ? $"{days}d {remHours}h" : $"{days}d";
            }
        }
        return future ? $"in {text}" : $"{text} ago";
    }
}
