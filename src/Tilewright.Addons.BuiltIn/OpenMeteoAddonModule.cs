using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed record ForecastDayDto(
    string Date,
    string Dow,
    int WeatherCode,
    string Description,
    string IconFile,
    string Sunrise,
    string Sunset);

public sealed class OpenMeteoAddonModule : IAddonModule, IActionHandler
{
    private sealed record CachedForecast(List<ForecastDayDto> Days, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, CachedForecast> _cache = new(StringComparer.Ordinal);

    public IActionHandler ActionHandler => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default) => Task.CompletedTask;

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (!string.Equals(action, "fetch-forecast", StringComparison.OrdinalIgnoreCase) || payload is null)
        {
            return new { error = "Unknown action." };
        }

        var lat = GetDouble(payload.Value, "latitude");
        var lon = GetDouble(payload.Value, "longitude");
        if (lat is null || lon is null || lat < -90 || lat > 90 || lon < -180 || lon > 180)
        {
            return new { needsSetup = true, error = "Configure valid latitude and longitude in tile settings." };
        }

        var tz = GetString(payload.Value, "timezone")?.Trim();
        if (string.IsNullOrWhiteSpace(tz)) tz = "Europe/London";

        var refreshRaw = GetString(payload.Value, "refreshInterval") ?? "30m";
        var cacheTtl = DurationParser.Parse(refreshRaw, TimeSpan.FromMinutes(30), TimeSpan.FromMinutes(5));

        var latStr = lat.Value.ToString("0.####", CultureInfo.InvariantCulture);
        var lonStr = lon.Value.ToString("0.####", CultureInfo.InvariantCulture);
        var cacheKey = $"{latStr}|{lonStr}|{tz}";

        if (_cache.TryGetValue(cacheKey, out var hit) && hit.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return new { days = hit.Days, cached = true, fetchedAt = DateTimeOffset.UtcNow };
        }

        try
        {
            var url = $"https://api.open-meteo.com/v1/forecast?latitude={latStr}&longitude={lonStr}&daily=weather_code,sunrise,sunset&timezone={Uri.EscapeDataString(tz)}&forecast_days=3";
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.TryAddWithoutValidation("User-Agent", "Tilewright/1.0");

            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                return new { error = $"Open-Meteo returned HTTP {(int)resp.StatusCode}." };
            }

            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("daily", out var daily) || daily.ValueKind != JsonValueKind.Object)
            {
                return new { error = "Unexpected Open-Meteo response format." };
            }

            var times = ReadStringArray(daily, "time");
            var codes = ReadIntArray(daily, "weather_code");
            var sunrises = ReadStringArray(daily, "sunrise");
            var sunsets = ReadStringArray(daily, "sunset");

            var count = Math.Min(3, times.Count);
            var days = new List<ForecastDayDto>(count);

            for (var i = 0; i < count; i++)
            {
                var dateStr = times[i];
                var dow = DateOnly.TryParse(dateStr, CultureInfo.InvariantCulture, out var dateOnly)
                    ? dateOnly.ToString("ddd", CultureInfo.InvariantCulture)
                    : dateStr;
                var code = i < codes.Count ? codes[i] : 0;
                var (desc, iconFile) = MapWmoCode(code);
                var sr = i < sunrises.Count ? ExtractTimeHHmm(sunrises[i]) : "--:--";
                var ss = i < sunsets.Count ? ExtractTimeHHmm(sunsets[i]) : "--:--";

                days.Add(new ForecastDayDto(dateStr, dow, code, desc, iconFile, sr, ss));
            }

            _cache[cacheKey] = new CachedForecast(days, DateTimeOffset.UtcNow.Add(cacheTtl));
            return new { days, cached = false, fetchedAt = DateTimeOffset.UtcNow };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Open-Meteo forecast fetch failed.");
            return new { error = $"Forecast fetch failed: {ex.Message}" };
        }
    }

    public static string ExtractTimeHHmm(string? iso)
    {
        if (string.IsNullOrWhiteSpace(iso)) return "--:--";
        var tIdx = iso.IndexOf('T');
        if (tIdx >= 0 && iso.Length >= tIdx + 6)
        {
            return iso.Substring(tIdx + 1, 5);
        }
        return iso;
    }

    /// <summary>
    /// Maps WMO Weather interpretation codes (Open-Meteo docs) to description and amedia/meteo-icons SVG filename.
    /// </summary>
    public static (string Description, string IconFile) MapWmoCode(int code) => code switch
    {
        0 => ("Clear sky", "1.svg"),
        1 => ("Mainly clear", "2.svg"),
        2 => ("Partly cloudy", "3.svg"),
        3 => ("Overcast", "4.svg"),
        45 => ("Fog", "15.svg"),
        48 => ("Depositing rime fog", "15.svg"),
        51 => ("Light drizzle", "46.svg"),
        53 => ("Moderate drizzle", "46.svg"),
        55 => ("Dense drizzle", "46.svg"),
        56 => ("Light freezing drizzle", "47.svg"),
        57 => ("Dense freezing drizzle", "12.svg"),
        61 => ("Slight rain", "9.svg"),
        63 => ("Moderate rain", "10.svg"),
        65 => ("Heavy rain", "10.svg"),
        66 => ("Light freezing rain", "47.svg"),
        67 => ("Heavy freezing rain", "48.svg"),
        71 => ("Slight snow fall", "49.svg"),
        73 => ("Moderate snow fall", "13.svg"),
        75 => ("Heavy snow fall", "50.svg"),
        77 => ("Snow grains", "49.svg"),
        80 => ("Slight rain showers", "5.svg"),
        81 => ("Moderate rain showers", "41.svg"),
        82 => ("Violent rain showers", "41.svg"),
        85 => ("Slight snow showers", "44.svg"),
        86 => ("Heavy snow showers", "45.svg"),
        95 => ("Thunderstorm", "11.svg"),
        96 => ("Thunderstorm with slight hail", "25.svg"),
        99 => ("Thunderstorm with heavy hail", "25.svg"),
        _ => ("Cloudy", "4.svg")
    };

    private static List<string> ReadStringArray(JsonElement obj, string prop)
    {
        var list = new List<string>();
        if (obj.TryGetProperty(prop, out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                list.Add(item.GetString() ?? string.Empty);
            }
        }
        return list;
    }

    private static List<int> ReadIntArray(JsonElement obj, string prop)
    {
        var list = new List<int>();
        if (obj.TryGetProperty(prop, out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var v)) list.Add(v);
                else list.Add(0);
            }
        }
        return list;
    }

    private static string? GetString(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    private static double? GetDouble(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(prop, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var n)) return n;
        if (v.ValueKind == JsonValueKind.String && double.TryParse(v.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            return parsed;
        return null;
    }
}
