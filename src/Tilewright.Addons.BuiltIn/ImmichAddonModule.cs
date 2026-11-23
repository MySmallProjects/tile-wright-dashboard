using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed class ImmichAddonModule : IAddonModule, IActionHandler, IDynamicOptionsProvider, IDisposable
{
    private const int MaxImageBytes = 15 * 1024 * 1024;
    private const int SearchBatchSize = 20;
    private const int LowWaterMark = 5;
    private const int MaxPools = 24;

    private sealed record ImmichConfig(string BaseUrl, string ApiKey, bool IgnoreSslErrors);

    private sealed record ImmichAssetSummary(
        string Id,
        string? OriginalFileName,
        string? OriginalPath,
        string? TakenAt,
        string? City,
        string? State,
        string? Country,
        string? Make,
        string? Model,
        string? LensModel,
        string? Description,
        int? Width,
        int? Height,
        string? Orientation,
        IReadOnlyList<string> People);

    private sealed class PrefetchPool
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public Queue<ImmichAssetSummary> Queue { get; } = new();
        public (ImmichAssetSummary Asset, string DataUrl)? ReadyNext { get; set; }
        public DateTimeOffset LastUsedUtc { get; set; } = DateTimeOffset.UtcNow;
        public int PrefetchRunning;
    }

    private readonly ConcurrentDictionary<string, PrefetchPool> _pools = new(StringComparer.Ordinal);
    private readonly object _insecureClientLock = new();
    private HttpClient? _insecureClient;
    private bool _disposed;

    public IActionHandler ActionHandler => this;
    public IDynamicOptionsProvider DynamicOptionsProvider => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default) => Task.CompletedTask;

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        lock (_insecureClientLock)
        {
            _insecureClient?.Dispose();
            _insecureClient = null;
        }
    }

    public async Task<IReadOnlyList<DynamicOption>> GetOptionsAsync(
        string endpoint,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        var config = await ReadConfigAsync(host, ct);
        if (config is null) return [];

        try
        {
            var client = GetHttpClient(host, config.IgnoreSslErrors);
            if (string.Equals(endpoint, "albums", StringComparison.OrdinalIgnoreCase))
            {
                return await FetchAlbumOptionsAsync(client, config, ct);
            }

            if (string.Equals(endpoint, "people", StringComparison.OrdinalIgnoreCase))
            {
                return await FetchPeopleOptionsAsync(client, config, ct);
            }

            if (string.Equals(endpoint, "tags", StringComparison.OrdinalIgnoreCase))
            {
                return await FetchTagOptionsAsync(client, config, ct);
            }
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Immich dynamic options fetch failed for endpoint '{Endpoint}'.", endpoint);
        }

        return [];
    }

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        var config = await ReadConfigAsync(host, ct);
        if (config is null)
        {
            return new
            {
                needsSetup = true,
                error = "Configure Immich Base URL and API Key in Settings → Addons."
            };
        }

        if (string.Equals(action, "fetch-random", StringComparison.OrdinalIgnoreCase))
        {
            return await HandleFetchRandomAsync(payload, config, host, ct);
        }

        if (string.Equals(action, "asset-info", StringComparison.OrdinalIgnoreCase))
        {
            return await HandleAssetInfoAsync(payload, config, host, ct);
        }

        return new { error = "Unknown action." };
    }

    private async Task<object> HandleFetchRandomAsync(
        JsonElement? payload,
        ImmichConfig config,
        IAddonHostContext host,
        CancellationToken ct)
    {
        var p = payload.HasValue && payload.Value.ValueKind == JsonValueKind.Object ? payload.Value : default;
        var imageSize = NormalizeImageSize(GetString(p, "imageSize"));
        var matchOrientation = GetBool(p, "matchOrientation");
        var desiredOrientation = matchOrientation ? NormalizeOrientation(GetString(p, "orientation")) : "any";
        var (searchBodyJson, parseError) = BuildSearchBodyJson(p);
        if (parseError is not null)
        {
            return new { error = parseError };
        }

        var poolKey = $"{config.BaseUrl}|{imageSize}|{desiredOrientation}|{searchBodyJson}";
        TrimPoolsIfNeeded();
        var pool = _pools.GetOrAdd(poolKey, _ => new PrefetchPool());
        pool.LastUsedUtc = DateTimeOffset.UtcNow;

        ImmichAssetSummary? selectedAsset = null;
        string? preloadedDataUrl = null;

        await pool.Gate.WaitAsync(ct);
        try
        {
            // 1. Check if we already pre-fetched the next image bytes
            if (pool.ReadyNext is { } ready)
            {
                selectedAsset = ready.Asset;
                preloadedDataUrl = ready.DataUrl;
                pool.ReadyNext = null;
            }
            else
            {
                // 2. Otherwise dequeue from the metadata queue, refilling from Immich if empty
                if (pool.Queue.Count == 0)
                {
                    var fetched = await FetchRandomBatchAsync(config, host, searchBodyJson, desiredOrientation, ct);
                    if (fetched.Error is not null)
                    {
                        return new { error = fetched.Error };
                    }

                    foreach (var item in fetched.Assets)
                    {
                        pool.Queue.Enqueue(item);
                    }
                }

                if (pool.Queue.Count > 0)
                {
                    selectedAsset = pool.Queue.Dequeue();
                }
            }
        }
        finally
        {
            pool.Gate.Release();
        }

        if (selectedAsset is null)
        {
            return new { error = "No matching images found in Immich for the configured filters." };
        }

        string dataUrl;
        if (preloadedDataUrl is not null)
        {
            dataUrl = preloadedDataUrl;
        }
        else
        {
            var (fetchedUrl, fetchErr) = await FetchThumbnailDataUrlAsync(config, host, selectedAsset.Id, imageSize, ct);
            if (fetchErr is not null || fetchedUrl is null)
            {
                return new { error = fetchErr ?? "Failed to load image from Immich." };
            }

            dataUrl = fetchedUrl;
        }

        // Trigger background pre-fetch for the next rotation / tap-to-advance
        TriggerBackgroundPrefetch(pool, config, host, searchBodyJson, imageSize, desiredOrientation);

        return new
        {
            assetId = selectedAsset.Id,
            dataUrl,
            immichUrl = $"{config.BaseUrl}/photos/{Uri.EscapeDataString(selectedAsset.Id)}",
            fileName = selectedAsset.OriginalFileName,
            originalPath = selectedAsset.OriginalPath,
            folder = ExtractFolder(selectedAsset.OriginalPath),
            takenAt = selectedAsset.TakenAt,
            city = selectedAsset.City,
            state = selectedAsset.State,
            country = selectedAsset.Country,
            make = selectedAsset.Make,
            model = selectedAsset.Model,
            lensModel = selectedAsset.LensModel,
            description = selectedAsset.Description,
            width = selectedAsset.Width,
            height = selectedAsset.Height,
            people = selectedAsset.People,
            fetchedAt = DateTimeOffset.UtcNow
        };
    }

    private void TriggerBackgroundPrefetch(
        PrefetchPool pool,
        ImmichConfig config,
        IAddonHostContext host,
        string searchBodyJson,
        string imageSize,
        string desiredOrientation)
    {
        if (_disposed) return;
        if (Interlocked.CompareExchange(ref pool.PrefetchRunning, 1, 0) != 0) return;

        _ = Task.Run(async () =>
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
                ImmichAssetSummary? nextAsset = null;

                await pool.Gate.WaitAsync(cts.Token);
                try
                {
                    if (pool.Queue.Count < LowWaterMark)
                    {
                        var fetched = await FetchRandomBatchAsync(config, host, searchBodyJson, desiredOrientation, cts.Token);
                        if (fetched.Error is null)
                        {
                            foreach (var item in fetched.Assets)
                            {
                                pool.Queue.Enqueue(item);
                            }
                        }
                    }

                    if (pool.ReadyNext is null && pool.Queue.Count > 0)
                    {
                        nextAsset = pool.Queue.Dequeue();
                    }
                }
                finally
                {
                    pool.Gate.Release();
                }

                if (nextAsset is not null)
                {
                    var (url, err) = await FetchThumbnailDataUrlAsync(config, host, nextAsset.Id, imageSize, cts.Token);
                    if (err is null && url is not null)
                    {
                        await pool.Gate.WaitAsync(cts.Token);
                        try
                        {
                            pool.ReadyNext ??= (nextAsset, url);
                        }
                        finally
                        {
                            pool.Gate.Release();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                host.Logger.LogDebug(ex, "Immich background pre-fetch skipped.");
            }
            finally
            {
                Interlocked.Exchange(ref pool.PrefetchRunning, 0);
            }
        });
    }

    private async Task<object> HandleAssetInfoAsync(
        JsonElement? payload,
        ImmichConfig config,
        IAddonHostContext host,
        CancellationToken ct)
    {
        var p = payload.HasValue && payload.Value.ValueKind == JsonValueKind.Object ? payload.Value : default;
        var assetId = GetString(p, "assetId");
        if (string.IsNullOrWhiteSpace(assetId))
        {
            return new { error = "Missing assetId." };
        }

        try
        {
            var client = GetHttpClient(host, config.IgnoreSslErrors);
            var escapedId = Uri.EscapeDataString(assetId);

            using var assetReq = CreateRequest(HttpMethod.Get, $"{config.BaseUrl}/api/assets/{escapedId}", config.ApiKey);
            using var assetResp = await client.SendAsync(assetReq, ct);
            if (!assetResp.IsSuccessStatusCode)
            {
                return new { error = $"Immich returned {(int)assetResp.StatusCode} for asset info." };
            }

            await using var assetStream = await assetResp.Content.ReadAsStreamAsync(ct);
            using var assetDoc = await JsonDocument.ParseAsync(assetStream, cancellationToken: ct);
            var summary = ParseAssetSummary(assetDoc.RootElement);

            var tags = new List<string>();
            if (assetDoc.RootElement.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var t in tagsEl.EnumerateArray())
                {
                    var name = GetString(t, "value") ?? GetString(t, "name");
                    if (!string.IsNullOrWhiteSpace(name)) tags.Add(name);
                }
            }

            var albums = new List<string>();
            try
            {
                using var albumReq = CreateRequest(HttpMethod.Get, $"{config.BaseUrl}/api/albums?assetId={escapedId}", config.ApiKey);
                using var albumResp = await client.SendAsync(albumReq, ct);
                if (albumResp.IsSuccessStatusCode)
                {
                    await using var albumStream = await albumResp.Content.ReadAsStreamAsync(ct);
                    using var albumDoc = await JsonDocument.ParseAsync(albumStream, cancellationToken: ct);
                    if (albumDoc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var a in albumDoc.RootElement.EnumerateArray())
                        {
                            var name = GetString(a, "albumName");
                            if (!string.IsNullOrWhiteSpace(name)) albums.Add(name);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                host.Logger.LogDebug(ex, "Immich album lookup failed for asset {AssetId}.", assetId);
            }

            return new
            {
                assetId,
                immichUrl = $"{config.BaseUrl}/photos/{escapedId}",
                fileName = summary?.OriginalFileName,
                originalPath = summary?.OriginalPath,
                folder = ExtractFolder(summary?.OriginalPath),
                takenAt = summary?.TakenAt,
                city = summary?.City,
                state = summary?.State,
                country = summary?.Country,
                make = summary?.Make,
                model = summary?.Model,
                lensModel = summary?.LensModel,
                description = summary?.Description,
                width = summary?.Width,
                height = summary?.Height,
                people = summary?.People ?? [],
                albums,
                tags
            };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Immich asset-info failed for {AssetId}.", assetId);
            return new { error = $"Failed to load asset details: {ex.Message}" };
        }
    }

    private async Task<(List<ImmichAssetSummary> Assets, string? Error)> FetchRandomBatchAsync(
        ImmichConfig config,
        IAddonHostContext host,
        string searchBodyJson,
        string desiredOrientation,
        CancellationToken ct)
    {
        try
        {
            var client = GetHttpClient(host, config.IgnoreSslErrors);
            var attempts = desiredOrientation is "landscape" or "portrait" ? 2 : 1;
            var fallback = new List<ImmichAssetSummary>();
            var matched = new List<ImmichAssetSummary>();

            for (var attempt = 0; attempt < attempts; attempt++)
            {
                using var req = CreateRequest(HttpMethod.Post, $"{config.BaseUrl}/api/search/random", config.ApiKey);
                req.Content = new StringContent(searchBodyJson, Encoding.UTF8, "application/json");

                using var resp = await client.SendAsync(req, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    return ([], $"Immich returned HTTP {(int)resp.StatusCode} from /api/search/random.");
                }

                await using var stream = await resp.Content.ReadAsStreamAsync(ct);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                {
                    return ([], "Unexpected response format from Immich /api/search/random.");
                }

                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    var item = ParseAssetSummary(el);
                    if (item is null) continue;
                    fallback.Add(item);

                    if (desiredOrientation is "landscape" or "portrait")
                    {
                        var assetOrient = ResolveEffectiveOrientation(item.Width, item.Height, item.Orientation);
                        if (string.Equals(assetOrient, desiredOrientation, StringComparison.Ordinal))
                        {
                            matched.Add(item);
                        }
                    }
                    else
                    {
                        matched.Add(item);
                    }
                }

                if (matched.Count > 0) break;
            }

            return (matched.Count > 0 ? matched : fallback, null);
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Immich searchRandom failed.");
            return ([], $"Immich request failed: {ex.Message}");
        }
    }

    private async Task<(string? DataUrl, string? Error)> FetchThumbnailDataUrlAsync(
        ImmichConfig config,
        IAddonHostContext host,
        string assetId,
        string imageSize,
        CancellationToken ct)
    {
        try
        {
            var client = GetHttpClient(host, config.IgnoreSslErrors);
            var url = $"{config.BaseUrl}/api/assets/{Uri.EscapeDataString(assetId)}/thumbnail?size={Uri.EscapeDataString(imageSize)}";
            using var req = CreateRequest(HttpMethod.Get, url, config.ApiKey, acceptJson: false);
            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                return (null, $"Immich returned HTTP {(int)resp.StatusCode} fetching thumbnail.");
            }

            var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
            if (bytes.Length == 0)
            {
                return (null, "Immich returned an empty image.");
            }

            if (bytes.Length > MaxImageBytes)
            {
                return (null, "Image exceeds 15 MB limit. Try using Thumbnail or Preview size.");
            }

            var contentType = resp.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
            var dataUrl = $"data:{contentType};base64,{Convert.ToBase64String(bytes)}";
            return (dataUrl, null);
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "Immich thumbnail fetch failed for asset {AssetId}.", assetId);
            return (null, $"Thumbnail fetch failed: {ex.Message}");
        }
    }

    private static async Task<IReadOnlyList<DynamicOption>> FetchAlbumOptionsAsync(
        HttpClient client,
        ImmichConfig config,
        CancellationToken ct)
    {
        using var req = CreateRequest(HttpMethod.Get, $"{config.BaseUrl}/api/albums", config.ApiKey);
        using var resp = await client.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return [];

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return [];

        var list = new List<DynamicOption>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            var id = GetString(el, "id");
            var name = GetString(el, "albumName");
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name)) continue;

            var count = GetInt(el, "assetCount");
            var label = count.HasValue ? $"{name} ({count.Value})" : name;
            list.Add(new DynamicOption(id, label));
        }

        return list.OrderBy(o => o.Label, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static async Task<IReadOnlyList<DynamicOption>> FetchPeopleOptionsAsync(
        HttpClient client,
        ImmichConfig config,
        CancellationToken ct)
    {
        using var req = CreateRequest(HttpMethod.Get, $"{config.BaseUrl}/api/people", config.ApiKey);
        using var resp = await client.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return [];

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        JsonElement peopleArr;
        if (doc.RootElement.ValueKind == JsonValueKind.Object &&
            doc.RootElement.TryGetProperty("people", out var pEl) &&
            pEl.ValueKind == JsonValueKind.Array)
        {
            peopleArr = pEl;
        }
        else if (doc.RootElement.ValueKind == JsonValueKind.Array)
        {
            peopleArr = doc.RootElement;
        }
        else
        {
            return [];
        }

        var list = new List<DynamicOption>();
        foreach (var el in peopleArr.EnumerateArray())
        {
            var id = GetString(el, "id");
            var name = GetString(el, "name");
            var isHidden = GetBool(el, "isHidden");
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name) || isHidden) continue;

            list.Add(new DynamicOption(id, name));
        }

        return list.OrderBy(o => o.Label, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static async Task<IReadOnlyList<DynamicOption>> FetchTagOptionsAsync(
        HttpClient client,
        ImmichConfig config,
        CancellationToken ct)
    {
        using var req = CreateRequest(HttpMethod.Get, $"{config.BaseUrl}/api/tags", config.ApiKey);
        using var resp = await client.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return [];

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return [];

        var list = new List<DynamicOption>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            var id = GetString(el, "id");
            var name = GetString(el, "value") ?? GetString(el, "name");
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name)) continue;

            list.Add(new DynamicOption(id, name));
        }

        return list.OrderBy(o => o.Label, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static (string BodyJson, string? Error) BuildSearchBodyJson(JsonElement payload)
    {
        var body = new JsonObject
        {
            ["type"] = "IMAGE",
            ["size"] = SearchBatchSize,
            ["withExif"] = true,
            ["withPeople"] = true
        };

        var albumId = GetString(payload, "albumId");
        if (!string.IsNullOrWhiteSpace(albumId))
        {
            body["albumIds"] = new JsonArray(albumId);
        }

        var personId = GetString(payload, "personId");
        if (!string.IsNullOrWhiteSpace(personId))
        {
            body["personIds"] = new JsonArray(personId);
        }

        var tagId = GetString(payload, "tagId");
        if (!string.IsNullOrWhiteSpace(tagId))
        {
            body["tagIds"] = new JsonArray(tagId);
        }

        if (GetBool(payload, "favoritesOnly"))
        {
            body["isFavorite"] = true;
        }

        var takenAfter = NormalizeDateFilter(GetString(payload, "takenAfter"), isEndOfDay: false);
        if (takenAfter is not null)
        {
            body["takenAfter"] = takenAfter;
        }

        var takenBefore = NormalizeDateFilter(GetString(payload, "takenBefore"), isEndOfDay: true);
        if (takenBefore is not null)
        {
            body["takenBefore"] = takenBefore;
        }

        var city = GetString(payload, "city");
        if (!string.IsNullOrWhiteSpace(city))
        {
            body["city"] = city;
        }

        var state = GetString(payload, "state");
        if (!string.IsNullOrWhiteSpace(state))
        {
            body["state"] = state;
        }

        var country = GetString(payload, "country");
        if (!string.IsNullOrWhiteSpace(country))
        {
            body["country"] = country;
        }

        var ratingStr = GetString(payload, "rating");
        if (!string.IsNullOrWhiteSpace(ratingStr) && int.TryParse(ratingStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var rating) && rating is >= 1 and <= 5)
        {
            body["rating"] = rating;
        }

        var extraJson = GetString(payload, "extraFiltersJson");
        if (!string.IsNullOrWhiteSpace(extraJson))
        {
            try
            {
                var extraNode = JsonNode.Parse(extraJson);
                if (extraNode is not JsonObject extraObj)
                {
                    return (string.Empty, "Extra JSON filters must be a valid JSON object (e.g. {\"make\":\"Canon\"}).");
                }

                foreach (var kv in extraObj)
                {
                    body[kv.Key] = kv.Value?.DeepClone();
                }
            }
            catch (JsonException ex)
            {
                return (string.Empty, $"Invalid Extra JSON filters: {ex.Message}");
            }
        }

        return (body.ToJsonString(), null);
    }

    internal static string? ResolveEffectiveOrientation(int? width, int? height, string? exifOrientation)
    {
        if (!width.HasValue || !height.HasValue || width.Value <= 0 || height.Value <= 0)
            return null;

        var w = width.Value;
        var h = height.Value;
        // EXIF orientations 5, 6, 7, 8 rotate the image 90/270 degrees (swapping width & height)
        if (exifOrientation is "5" or "6" or "7" or "8")
        {
            (w, h) = (h, w);
        }

        var ratio = (double)w / h;
        if (ratio >= 1.1) return "landscape";
        if (ratio <= 1.0 / 1.1) return "portrait";
        return "square";
    }

    private static ImmichAssetSummary? ParseAssetSummary(JsonElement el)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        var id = GetString(el, "id");
        if (string.IsNullOrWhiteSpace(id)) return null;

        var fileName = GetString(el, "originalFileName");
        var originalPath = GetString(el, "originalPath");
        var takenAt = GetString(el, "localDateTime") ?? GetString(el, "fileCreatedAt");

        string? city = null, state = null, country = null, make = null, model = null, lensModel = null, description = null, orientation = null;
        int? width = null, height = null;

        if (el.TryGetProperty("exifInfo", out var exif) && exif.ValueKind == JsonValueKind.Object)
        {
            takenAt = GetString(exif, "dateTimeOriginal") ?? takenAt;
            city = GetString(exif, "city");
            state = GetString(exif, "state");
            country = GetString(exif, "country");
            make = GetString(exif, "make");
            model = GetString(exif, "model");
            lensModel = GetString(exif, "lensModel");
            description = GetString(exif, "description");
            orientation = GetString(exif, "orientation");
            width = GetInt(exif, "exifImageWidth");
            height = GetInt(exif, "exifImageHeight");
        }

        var people = new List<string>();
        if (el.TryGetProperty("people", out var peopleEl) && peopleEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var person in peopleEl.EnumerateArray())
            {
                var name = GetString(person, "name");
                if (!string.IsNullOrWhiteSpace(name) && !people.Contains(name, StringComparer.OrdinalIgnoreCase))
                {
                    people.Add(name);
                }
            }
        }

        return new ImmichAssetSummary(
            id, fileName, originalPath, takenAt,
            city, state, country, make, model, lensModel, description,
            width, height, orientation, people);
    }

    private async Task<ImmichConfig?> ReadConfigAsync(IAddonHostContext host, CancellationToken ct)
    {
        var settings = await host.Settings.GetAddonSettingsAsync(ct);
        var rawUrl = settings.TryGetValue("baseUrl", out var u) && u.ValueKind == JsonValueKind.String
            ? u.GetString()?.Trim()
            : null;
        var apiKey = await host.Secrets.GetSecretAsync("apiKey", ct);

        if (string.IsNullOrWhiteSpace(rawUrl) || string.IsNullOrWhiteSpace(apiKey))
            return null;

        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            return null;

        var normalized = rawUrl.TrimEnd('/');
        if (normalized.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[..^4];
        }

        var ignoreSsl = settings.TryGetValue("ignoreSslErrors", out var ssl) &&
                        ssl.ValueKind == JsonValueKind.True;

        return new ImmichConfig(normalized, apiKey.Trim(), ignoreSsl);
    }

    private HttpClient GetHttpClient(IAddonHostContext host, bool ignoreSslErrors)
    {
        if (!ignoreSslErrors)
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            return client;
        }

        lock (_insecureClientLock)
        {
            if (_insecureClient is null)
            {
                var handler = new SocketsHttpHandler
                {
                    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
                    SslOptions = new System.Net.Security.SslClientAuthenticationOptions
                    {
                        RemoteCertificateValidationCallback = (_, _, _, _) => true
                    }
                };
                _insecureClient = new HttpClient(handler)
                {
                    Timeout = TimeSpan.FromSeconds(15)
                };
            }

            return _insecureClient;
        }
    }

    private static HttpRequestMessage CreateRequest(HttpMethod method, string url, string apiKey, bool acceptJson = true)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.TryAddWithoutValidation("x-api-key", apiKey);
        if (acceptJson)
        {
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }
        return req;
    }

    private void TrimPoolsIfNeeded()
    {
        if (_pools.Count < MaxPools) return;
        var oldest = _pools.OrderBy(kv => kv.Value.LastUsedUtc).Take(_pools.Count - MaxPools + 4).Select(kv => kv.Key).ToList();
        foreach (var key in oldest)
        {
            _pools.TryRemove(key, out _);
        }
    }

    private static string NormalizeImageSize(string? raw) =>
        raw?.Trim().ToLowerInvariant() switch
        {
            "preview" => "preview",
            "fullsize" => "fullsize",
            _ => "thumbnail"
        };

    private static string NormalizeOrientation(string? raw) =>
        raw?.Trim().ToLowerInvariant() switch
        {
            "landscape" => "landscape",
            "portrait" => "portrait",
            _ => "any"
        };

    private static string? NormalizeDateFilter(string? raw, bool isEndOfDay)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = raw.Trim();
        if (DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateOnly))
        {
            return isEndOfDay
                ? $"{dateOnly:yyyy-MM-dd}T23:59:59.999Z"
                : $"{dateOnly:yyyy-MM-dd}T00:00:00.000Z";
        }
        return s;
    }

    private static string? ExtractFolder(string? originalPath)
    {
        if (string.IsNullOrWhiteSpace(originalPath)) return null;
        var normalized = originalPath.Replace('\\', '/');
        var idx = normalized.LastIndexOf('/');
        return idx > 0 ? normalized[..idx] : null;
    }

    private static string? GetString(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(prop, out var v))
            return null;
        if (v.ValueKind == JsonValueKind.String)
        {
            var s = v.GetString()?.Trim();
            return string.IsNullOrEmpty(s) ? null : s;
        }
        return null;
    }

    private static int? GetInt(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(prop, out var v))
            return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i))
            return i;
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
            return parsed;
        return null;
    }

    private static bool GetBool(JsonElement el, string prop)
    {
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(prop, out var v))
            return false;
        return v.ValueKind == JsonValueKind.True;
    }
}
