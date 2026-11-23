using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Tilewright.AddonContracts;
using Tilewright.Addons.BuiltIn;
using Tilewright.Server.Addons;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class ImmichAddonTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-immich-{Guid.NewGuid():N}");

    [Fact]
    public async Task FetchRandom_WhenNotConfigured_ReturnsNeedsSetup()
    {
        using var module = new ImmichAddonModule();
        var host = new FakeImmichHost(new FakeHttpHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)), baseUrl: null, apiKey: null);

        var res = JsonSerializer.SerializeToElement(await module.HandleActionAsync("fetch-random", null, host));
        Assert.True(res.GetProperty("needsSetup").GetBoolean());
    }

    [Fact]
    public async Task FetchRandom_SendsFiltersAndApiKey_ReturnsMetadataAndDataUrl_AndPrefetches()
    {
        var searchCalls = 0;
        string? capturedSearchBody = null;
        string? capturedApiKey = null;
        string? capturedThumbQuery = null;

        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

        var handler = new FakeHttpHandler(req =>
        {
            capturedApiKey = req.Headers.TryGetValues("x-api-key", out var vals) ? vals.FirstOrDefault() : null;

            if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath == "/api/search/random")
            {
                Interlocked.Increment(ref searchCalls);
                capturedSearchBody = req.Content!.ReadAsStringAsync().GetAwaiter().GetResult();

                var assets = new object[]
                {
                    new
                    {
                        id = "asset-1",
                        originalFileName = "IMG_0001.JPG",
                        originalPath = "/library/2024/Summer/IMG_0001.JPG",
                        fileCreatedAt = "2024-08-14T10:00:00Z",
                        exifInfo = new
                        {
                            dateTimeOriginal = "2024-08-14T15:42:00Z",
                            city = "Edinburgh",
                            state = "Scotland",
                            country = "United Kingdom",
                            make = "Canon",
                            model = "EOS R6",
                            lensModel = "RF 35mm F1.8",
                            description = "Castle view",
                            exifImageWidth = 4000,
                            exifImageHeight = 3000,
                            orientation = "1"
                        },
                        people = new[] { new { id = "p1", name = "Alice" }, new { id = "p2", name = "" } }
                    },
                    new
                    {
                        id = "asset-2",
                        originalFileName = "IMG_0002.JPG",
                        originalPath = "/library/2024/Summer/IMG_0002.JPG",
                        fileCreatedAt = "2024-08-15T10:00:00Z"
                    }
                };
                return JsonResponse(assets);
            }

            if (req.Method == HttpMethod.Get && req.RequestUri!.AbsolutePath.EndsWith("/thumbnail", StringComparison.Ordinal))
            {
                capturedThumbQuery = req.RequestUri.Query;
                var resp = new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(pngBytes)
                };
                resp.Content.Headers.ContentType = new MediaTypeHeaderValue("image/webp");
                return resp;
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        using var module = new ImmichAddonModule();
        var host = new FakeImmichHost(handler, "http://immich.local:2283/", "secret-key-123");

        var payload = JsonSerializer.SerializeToElement(new
        {
            imageSize = "thumbnail",
            albumId = "alb-1",
            personId = "per-1",
            tagId = "tag-1",
            favoritesOnly = true,
            takenAfter = "2024-01-01",
            takenBefore = "2024-12-31",
            city = "Edinburgh",
            country = "United Kingdom",
            rating = "5",
            extraFiltersJson = "{\"make\":\"Canon\"}"
        });

        var r1 = JsonSerializer.SerializeToElement(await module.HandleActionAsync("fetch-random", payload, host));

        Assert.Equal("secret-key-123", capturedApiKey);
        Assert.Equal("?size=thumbnail", capturedThumbQuery);
        Assert.Equal("asset-1", r1.GetProperty("assetId").GetString());
        Assert.Equal("http://immich.local:2283/photos/asset-1", r1.GetProperty("immichUrl").GetString());
        Assert.Equal("IMG_0001.JPG", r1.GetProperty("fileName").GetString());
        Assert.Equal("/library/2024/Summer", r1.GetProperty("folder").GetString());
        Assert.Equal("Edinburgh", r1.GetProperty("city").GetString());
        Assert.Equal("Alice", r1.GetProperty("people")[0].GetString());
        Assert.StartsWith("data:image/webp;base64,", r1.GetProperty("dataUrl").GetString());

        Assert.NotNull(capturedSearchBody);
        using var bodyDoc = JsonDocument.Parse(capturedSearchBody);
        var root = bodyDoc.RootElement;
        Assert.Equal("IMAGE", root.GetProperty("type").GetString());
        Assert.Equal("alb-1", root.GetProperty("albumIds")[0].GetString());
        Assert.Equal("per-1", root.GetProperty("personIds")[0].GetString());
        Assert.Equal("tag-1", root.GetProperty("tagIds")[0].GetString());
        Assert.True(root.GetProperty("isFavorite").GetBoolean());
        Assert.Equal("2024-01-01T00:00:00.000Z", root.GetProperty("takenAfter").GetString());
        Assert.Equal("2024-12-31T23:59:59.999Z", root.GetProperty("takenBefore").GetString());
        Assert.Equal("Edinburgh", root.GetProperty("city").GetString());
        Assert.Equal(5, root.GetProperty("rating").GetInt32());
        Assert.Equal("Canon", root.GetProperty("make").GetString());

        // Second call should serve asset-2 from the pre-fetched pool without calling searchRandom again
        var r2 = JsonSerializer.SerializeToElement(await module.HandleActionAsync("fetch-random", payload, host));
        Assert.Equal("asset-2", r2.GetProperty("assetId").GetString());
        Assert.True(searchCalls >= 1);
    }

    [Fact]
    public async Task FetchRandom_MatchOrientation_RespectsExifRotation()
    {
        var handler = new FakeHttpHandler(req =>
        {
            if (req.Method == HttpMethod.Post && req.RequestUri!.AbsolutePath == "/api/search/random")
            {
                return JsonResponse(new[]
                {
                    // 4000x3000 with EXIF orientation 6 (90deg rotated) => effectively PORTRAIT
                    new
                    {
                        id = "rotated-portrait",
                        originalFileName = "P.JPG",
                        exifInfo = new { exifImageWidth = 4000, exifImageHeight = 3000, orientation = "6" }
                    },
                    // 4000x3000 with orientation 1 => effectively LANDSCAPE
                    new
                    {
                        id = "true-landscape",
                        originalFileName = "L.JPG",
                        exifInfo = new { exifImageWidth = 4000, exifImageHeight = 3000, orientation = "1" }
                    }
                });
            }

            var resp = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent([1, 2, 3, 4])
            };
            resp.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            return resp;
        });

        using var module = new ImmichAddonModule();
        var host = new FakeImmichHost(handler, "http://immich.local:2283", "k");

        var landscapeRes = JsonSerializer.SerializeToElement(await module.HandleActionAsync(
            "fetch-random",
            JsonSerializer.SerializeToElement(new { matchOrientation = true, orientation = "landscape" }),
            host));
        Assert.Equal("true-landscape", landscapeRes.GetProperty("assetId").GetString());

        var portraitRes = JsonSerializer.SerializeToElement(await module.HandleActionAsync(
            "fetch-random",
            JsonSerializer.SerializeToElement(new { matchOrientation = true, orientation = "portrait" }),
            host));
        Assert.Equal("rotated-portrait", portraitRes.GetProperty("assetId").GetString());
    }

    [Fact]
    public async Task DynamicOptions_ReturnsSortedAlbumsPeopleAndTags()
    {
        var handler = new FakeHttpHandler(req => req.RequestUri!.AbsolutePath switch
        {
            "/api/albums" => JsonResponse(new[]
            {
                new { id = "a2", albumName = "Zambia Trip", assetCount = 12 },
                new { id = "a1", albumName = "Austria", assetCount = 45 }
            }),
            "/api/people" => JsonResponse(new
            {
                people = new[]
                {
                    new { id = "p1", name = "Zoe", isHidden = false },
                    new { id = "p2", name = "Hidden Person", isHidden = true },
                    new { id = "p3", name = "", isHidden = false },
                    new { id = "p4", name = "Alice", isHidden = false }
                }
            }),
            "/api/tags" => JsonResponse(new[]
            {
                new { id = "t1", name = "Sunset", value = "Nature/Sunset" },
                new { id = "t2", name = "Beach", value = "Beach" }
            }),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        });

        using var module = new ImmichAddonModule();
        var host = new FakeImmichHost(handler, "http://immich.local:2283", "k");

        var albums = await module.GetOptionsAsync("albums", host);
        Assert.Equal(2, albums.Count);
        Assert.Equal("a1", albums[0].Value);
        Assert.Equal("Austria (45)", albums[0].Label);

        var people = await module.GetOptionsAsync("people", host);
        Assert.Equal(2, people.Count);
        Assert.Equal("Alice", people[0].Label);
        Assert.Equal("Zoe", people[1].Label);

        var tags = await module.GetOptionsAsync("tags", host);
        Assert.Equal(2, tags.Count);
        Assert.Equal("Beach", tags[0].Label);
        Assert.Equal("Nature/Sunset", tags[1].Label);
    }

    [Fact]
    public async Task AssetInfo_ReturnsFullMetadataAndAlbums()
    {
        var handler = new FakeHttpHandler(req =>
        {
            if (req.RequestUri!.AbsolutePath == "/api/assets/asset-99")
            {
                return JsonResponse(new
                {
                    id = "asset-99",
                    originalFileName = "DSC01234.JPG",
                    originalPath = "/photos/2025/Japan/DSC01234.JPG",
                    exifInfo = new { dateTimeOriginal = "2025-04-02T09:15:00Z", city = "Kyoto", country = "Japan" },
                    people = new[] { new { name = "Bob" } },
                    tags = new[] { new { value = "Travel/Japan" } }
                });
            }

            if (req.RequestUri.AbsolutePath == "/api/albums" && req.RequestUri.Query == "?assetId=asset-99")
            {
                return JsonResponse(new[] { new { id = "alb-1", albumName = "Japan 2025" } });
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        using var module = new ImmichAddonModule();
        var host = new FakeImmichHost(handler, "http://immich.local:2283", "k");

        var res = JsonSerializer.SerializeToElement(await module.HandleActionAsync(
            "asset-info",
            JsonSerializer.SerializeToElement(new { assetId = "asset-99" }),
            host));

        Assert.Equal("DSC01234.JPG", res.GetProperty("fileName").GetString());
        Assert.Equal("/photos/2025/Japan", res.GetProperty("folder").GetString());
        Assert.Equal("Japan 2025", res.GetProperty("albums")[0].GetString());
        Assert.Equal("Travel/Japan", res.GetProperty("tags")[0].GetString());
        Assert.Equal("http://immich.local:2283/photos/asset-99", res.GetProperty("immichUrl").GetString());
    }

    [Fact]
    public async Task BuiltInImmichAddon_ManifestAndTileAreDiscovered()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();
        (await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

        var overview = await client.GetFromJsonAsync<AddonOverviewDto>("/api/addons");
        Assert.NotNull(overview);

        var immich = overview.Addons.FirstOrDefault(a => a.Id == "immich");
        Assert.NotNull(immich);
        Assert.True(immich.BuiltIn);
        Assert.Equal("Tilewright.Addons.BuiltIn.ImmichAddonModule", immich.Contributes?.Server?.EntryType);
        Assert.Contains(immich.Contributes!.Tiles, t => t.Id == "random-photo");
        Assert.Contains(immich.Contributes.AddonSettingsSchema, s => s.Key == "baseUrl");
        Assert.Contains(immich.Contributes.AddonSettingsSchema, s => s.Key == "apiKey" && s.Type == "secret");
        Assert.Contains(immich.Contributes.AddonSettingsSchema, s => s.Key == "ignoreSslErrors" && s.Type == "toggle");
    }

    private static HttpResponseMessage JsonResponse(object obj) =>
        new(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(obj), Encoding.UTF8, "application/json")
        };

    private sealed class FakeHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(responder(request));
    }

    private sealed class FakeImmichHost : IAddonHostContext, IAddonHttpClientFactory, IAddonSecretStore, IAddonSettingsReader
    {
        private readonly HttpMessageHandler _handler;
        private readonly IReadOnlyDictionary<string, JsonElement> _settings;
        private readonly string? _apiKey;

        public FakeImmichHost(HttpMessageHandler handler, string? baseUrl, string? apiKey, bool ignoreSsl = false)
        {
            _handler = handler;
            _apiKey = apiKey;
            var dict = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            if (baseUrl is not null) dict["baseUrl"] = JsonSerializer.SerializeToElement(baseUrl);
            if (ignoreSsl) dict["ignoreSslErrors"] = JsonSerializer.SerializeToElement(true);
            _settings = dict;
        }

        public string AddonId => "immich";
        public string DataFolder => Path.GetTempPath();
        public IAddonHttpClientFactory Http => this;
        public IAddonSecretStore Secrets => this;
        public IAddonSettingsReader Settings => this;
        public IAddonPushService Push => throw new NotImplementedException();
        public ILogger Logger => NullLogger.Instance;

        public HttpClient CreateClient(string? name = null) => new(_handler, disposeHandler: false);
        public Task<string?> GetSecretAsync(string key, CancellationToken ct = default) => Task.FromResult(key == "apiKey" ? _apiKey : null);
        public Task SetSecretAsync(string key, string? value, CancellationToken ct = default) => Task.CompletedTask;
        public Task<IReadOnlyDictionary<string, bool>> GetSecretStatusAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyDictionary<string, bool>>(new Dictionary<string, bool> { ["apiKey"] = !string.IsNullOrEmpty(_apiKey) });
        public Task<IReadOnlyDictionary<string, JsonElement>> GetAddonSettingsAsync(CancellationToken ct = default) =>
            Task.FromResult(_settings);
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
