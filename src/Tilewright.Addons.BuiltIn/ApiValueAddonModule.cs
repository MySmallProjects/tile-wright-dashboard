using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed class ApiValueAddonModule : IAddonModule, IActionHandler
{
    private sealed record CachedBody(string Body, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, CachedBody> _bodyCache = new(StringComparer.Ordinal);

    public IActionHandler ActionHandler => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default) => Task.CompletedTask;

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (payload is null)
        {
            return new { error = "Unknown action." };
        }

        if (string.Equals(action, "fetch-value", StringComparison.OrdinalIgnoreCase))
        {
            return await HandleSingleFetchAsync(payload.Value, host, ct);
        }

        if (string.Equals(action, "fetch-values", StringComparison.OrdinalIgnoreCase))
        {
            return await HandleMultiFetchAsync(payload.Value, host, ct);
        }

        return new { error = "Unknown action." };
    }

    private async Task<object> HandleSingleFetchAsync(JsonElement payload, IAddonHostContext host, CancellationToken ct)
    {
        var (uri, cacheTtl, setupErr) = ParseFetchSetup(payload);
        if (setupErr is not null || uri is null)
        {
            return new { needsSetup = true, error = setupErr };
        }

        var (body, cached, fetchErr) = await FetchBodyCachedAsync(uri, cacheTtl, host, ct);
        if (fetchErr is not null || body is null)
        {
            return new { error = fetchErr ?? "Fetch failed." };
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var item = ExtractAndFormatItem(doc.RootElement, payload);
            if (item.Error is not null)
            {
                return new { error = item.Error };
            }
            return new { value = item.Value, raw = item.Raw, cached, fetchedAt = DateTimeOffset.UtcNow };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "API value parse failed.");
            return new { error = $"Parse failed: {ex.Message}" };
        }
    }

    private async Task<object> HandleMultiFetchAsync(JsonElement payload, IAddonHostContext host, CancellationToken ct)
    {
        var (uri, cacheTtl, setupErr) = ParseFetchSetup(payload);
        if (setupErr is not null || uri is null)
        {
            return new { needsSetup = true, error = setupErr };
        }

        if (!payload.TryGetProperty("items", out var itemsEl) || itemsEl.ValueKind != JsonValueKind.Array || itemsEl.GetArrayLength() == 0)
        {
            return new { needsSetup = true, error = "Add at least one item in tile settings." };
        }

        var (body, cached, fetchErr) = await FetchBodyCachedAsync(uri, cacheTtl, host, ct);
        if (fetchErr is not null || body is null)
        {
            return new { error = fetchErr ?? "Fetch failed." };
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var results = new List<object>();
            foreach (var itemEl in itemsEl.EnumerateArray())
            {
                var extracted = ExtractAndFormatItem(doc.RootElement, itemEl);
                results.Add(new { value = extracted.Value, raw = extracted.Raw, error = extracted.Error });
            }
            return new { items = results, cached, fetchedAt = DateTimeOffset.UtcNow };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "API multi-value parse failed.");
            return new { error = $"Parse failed: {ex.Message}" };
        }
    }

    private static (Uri? Uri, TimeSpan CacheTtl, string? SetupError) ParseFetchSetup(JsonElement payload)
    {
        var url = GetString(payload, "apiUrl");
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return (null, TimeSpan.Zero, "Configure a valid API URL in tile settings.");
        }

        var refreshRaw = GetString(payload, "refreshInterval") ?? "15m";
        var cacheTtl = DurationParser.Parse(refreshRaw, TimeSpan.FromMinutes(15), TimeSpan.FromSeconds(10));
        return (uri, cacheTtl, null);
    }

    private async Task<(string? Body, bool Cached, string? Error)> FetchBodyCachedAsync(
        Uri uri,
        TimeSpan cacheTtl,
        IAddonHostContext host,
        CancellationToken ct)
    {
        var cacheKey = uri.ToString();
        if (_bodyCache.TryGetValue(cacheKey, out var hit) && hit.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return (hit.Body, true, null);
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
                return (null, false, $"API returned HTTP {(int)resp.StatusCode}.");
            }

            var body = await resp.Content.ReadAsStringAsync(ct);
            _bodyCache[cacheKey] = new CachedBody(body, DateTimeOffset.UtcNow.Add(cacheTtl));
            return (body, false, null);
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "API value fetch failed.");
            return (null, false, $"Fetch failed: {ex.Message}");
        }
    }

    private static (string? Value, string? Raw, string? Error) ExtractAndFormatItem(JsonElement root, JsonElement itemConfig)
    {
        var jsonPath = GetString(itemConfig, "jsonPath");
        var extracted = JsonPathExtractor.Extract(root, jsonPath);
        if (extracted is null)
        {
            return (null, null, $"JSON path '{jsonPath}' not found.");
        }

        var rawStr = extracted.Value.ValueKind switch
        {
            JsonValueKind.String => extracted.Value.GetString() ?? string.Empty,
            JsonValueKind.Number => extracted.Value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => extracted.Value.GetRawText()
        };

        var prefix = GetString(itemConfig, "prefix") ?? string.Empty;
        var suffix = GetString(itemConfig, "suffix") ?? string.Empty;
        var numberFormat = GetString(itemConfig, "numberFormat")?.Trim();
        var decimals = GetDecimals(itemConfig);

        var display = FormatNumericValue(rawStr, numberFormat, decimals);
        return ($"{prefix}{display}{suffix}", rawStr, null);
    }

    private static int? GetDecimals(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty("decimals", out var decEl))
            return null;

        if (decEl.ValueKind == JsonValueKind.Number && decEl.TryGetInt32(out var n))
            return n;

        if (decEl.ValueKind == JsonValueKind.String && int.TryParse(decEl.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
            return parsed;

        return null;
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
