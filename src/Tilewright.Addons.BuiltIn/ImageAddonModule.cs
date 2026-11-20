using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed class ImageAddonModule : IAddonModule, IActionHandler
{
    private const int MaxImageBytes = 10 * 1024 * 1024;
    private static readonly string[] ImageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

    private sealed record CachedImage(string DataUrl, string? Caption, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, CachedImage> _cache = new(StringComparer.Ordinal);

    public IActionHandler ActionHandler => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default)
    {
        Directory.CreateDirectory(Path.Combine(host.DataFolder, "images"));
        return Task.CompletedTask;
    }

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (!string.Equals(action, "fetch-image", StringComparison.OrdinalIgnoreCase) || payload is null)
        {
            return new { error = "Unknown action." };
        }

        var mode = GetString(payload.Value, "sourceMode") ?? "url";
        var refreshRaw = GetString(payload.Value, "refreshInterval") ?? "5m";
        var cacheTtl = DurationParser.Parse(refreshRaw, TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(3));

        if (string.Equals(mode, "folder", StringComparison.OrdinalIgnoreCase))
        {
            return await FetchRandomFromFolderAsync(payload.Value, host, ct);
        }

        var url = GetString(payload.Value, "imageUrl");
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return new { needsSetup = true, error = "Configure a valid HTTP/HTTPS image URL." };
        }

        var cacheKey = $"url:{url}";
        if (_cache.TryGetValue(cacheKey, out var hit) && hit.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return new { dataUrl = hit.DataUrl, cached = true, fetchedAt = DateTimeOffset.UtcNow };
        }

        try
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
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
                return new { error = $"Remote server returned {(int)resp.StatusCode}." };
            }

            var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
            if (bytes.Length > MaxImageBytes)
            {
                return new { error = "Remote image exceeds 10 MB limit." };
            }

            var contentType = resp.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
            var dataUrl = $"data:{contentType};base64,{Convert.ToBase64String(bytes)}";
            _cache[cacheKey] = new CachedImage(dataUrl, null, DateTimeOffset.UtcNow.Add(cacheTtl));

            return new { dataUrl, cached = false, fetchedAt = DateTimeOffset.UtcNow };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Image fetch failed for URL.");
            return new { error = $"Image fetch failed: {ex.Message}" };
        }
    }

    private static async Task<object> FetchRandomFromFolderAsync(
        JsonElement payload,
        IAddonHostContext host,
        CancellationToken ct)
    {
        var defaultRoot = Path.Combine(host.DataFolder, "images");
        var addonSettings = await host.Settings.GetAddonSettingsAsync(ct);
        var configuredRoot = addonSettings.TryGetValue("allowedFolderRoot", out var r) && !string.IsNullOrWhiteSpace(r.GetString())
            ? r.GetString()!
            : defaultRoot;

        var rootFull = Path.GetFullPath(configuredRoot);
        var sub = GetString(payload, "folderPath")?.Trim() ?? string.Empty;
        if (sub.Contains("..", StringComparison.Ordinal) || Path.IsPathRooted(sub))
        {
            return new { error = "Invalid folder path." };
        }

        var targetDir = string.IsNullOrEmpty(sub) ? rootFull : Path.GetFullPath(Path.Combine(rootFull, sub));
        if (!targetDir.StartsWith(rootFull, StringComparison.Ordinal) || !Directory.Exists(targetDir))
        {
            return new { error = $"Folder not found. Place images in {defaultRoot}." };
        }

        var files = Directory.GetFiles(targetDir)
            .Where(f => ImageExtensions.Contains(Path.GetExtension(f), StringComparer.OrdinalIgnoreCase))
            .ToArray();

        if (files.Length == 0)
        {
            return new { error = $"No images found in {targetDir}." };
        }

        var chosen = files[Random.Shared.Next(files.Length)];
        var bytes = await File.ReadAllBytesAsync(chosen, ct);
        if (bytes.Length > MaxImageBytes)
        {
            return new { error = "Selected image exceeds 10 MB limit." };
        }

        var mime = Path.GetExtension(chosen).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/jpeg"
        };

        return new
        {
            dataUrl = $"data:{mime};base64,{Convert.ToBase64String(bytes)}",
            fileName = Path.GetFileName(chosen),
            fetchedAt = DateTimeOffset.UtcNow
        };
    }

    private static string? GetString(JsonElement el, string prop) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;
}
