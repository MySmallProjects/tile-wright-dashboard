using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed class ApiValueAddonModule : IAddonModule, IActionHandler
{
    private sealed record CachedValue(string Formatted, string Raw, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, CachedValue> _cache = new(StringComparer.Ordinal);

    public IActionHandler ActionHandler => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default) => Task.CompletedTask;

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (!string.Equals(action, "fetch-value", StringComparison.OrdinalIgnoreCase) || payload is null)
        {
            return new { error = "Unknown action." };
        }

        var url = GetString(payload.Value, "apiUrl");
        var jsonPath = GetString(payload.Value, "jsonPath");
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return new { needsSetup = true, error = "Configure a valid API URL in tile settings." };
        }

        var refreshRaw = GetString(payload.Value, "refreshInterval") ?? "15m";
        var cacheTtl = DurationParser.Parse(refreshRaw, TimeSpan.FromMinutes(15), TimeSpan.FromSeconds(10));
        var prefix = GetString(payload.Value, "prefix") ?? string.Empty;
        var suffix = GetString(payload.Value, "suffix") ?? string.Empty;
        var numberFormat = GetString(payload.Value, "numberFormat")?.Trim();
        int? decimals = payload.Value.TryGetProperty("decimals", out var decEl) && decEl.ValueKind == JsonValueKind.Number
            ? decEl.GetInt32()
            : null;

        var cacheKey = $"{url}|{jsonPath}|{prefix}|{suffix}|{numberFormat}|{decimals}";
        if (_cache.TryGetValue(cacheKey, out var hit) && hit.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return new { value = hit.Formatted, raw = hit.Raw, cached = true, fetchedAt = DateTimeOffset.UtcNow };
        }

        try
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            req.Headers.TryAddWithoutValidation("User-Agent", "Tilewright/1.0");

            var addonSettings = await host.Settings.GetAddonSettingsAsync(ct);
            var headerName = addonSettings.TryGetValue("authHeaderName", out var hn) ? hn.GetString() : null;
            var headerVal = await host.Secrets.GetSecretAsync("authHeaderValue", ct);
            if (!string.IsNullOrWhiteSpace(headerName) && !string.IsNullOrWhiteSpace(headerVal))
            {
                req.Headers.TryAddWithoutValidation(headerName.Trim(), headerVal);
            }

            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                return new { error = $"API returned HTTP {(int)resp.StatusCode}." };
            }

            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var extracted = JsonPathExtractor.Extract(doc.RootElement, jsonPath);
            if (extracted is null)
            {
                return new { error = $"JSON path '{jsonPath}' not found." };
            }

            var rawStr = extracted.Value.ValueKind switch
            {
                JsonValueKind.String => extracted.Value.GetString() ?? string.Empty,
                JsonValueKind.Number => extracted.Value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => extracted.Value.GetRawText()
            };

            var display = FormatNumericValue(rawStr, numberFormat, decimals);

            var formatted = $"{prefix}{display}{suffix}";
            _cache[cacheKey] = new CachedValue(formatted, rawStr, DateTimeOffset.UtcNow.Add(cacheTtl));

            return new { value = formatted, raw = rawStr, cached = false, fetchedAt = DateTimeOffset.UtcNow };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "API value fetch failed.");
            return new { error = $"Fetch failed: {ex.Message}" };
        }
    }

    public static string FormatNumericValue(string rawStr, string? numberFormat, int? decimals)
    {
        if (!double.TryParse(rawStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var num))
        {
            return rawStr;
        }

        if (!string.IsNullOrWhiteSpace(numberFormat))
        {
            try
            {
                return num.ToString(numberFormat, CultureInfo.InvariantCulture);
            }
            catch (FormatException)
            {
                // Fall back to decimals/raw if format string is invalid
            }
        }

        if (decimals.HasValue && decimals.Value >= 0)
        {
            return num.ToString($"F{Math.Clamp(decimals.Value, 0, 6)}", CultureInfo.InvariantCulture);
        }

        return rawStr;
    }

    private static string? GetString(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;
}
