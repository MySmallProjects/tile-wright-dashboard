using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Tilewright.Server.Addons;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class AddonFrameworkTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-addons-{Guid.NewGuid():N}");

    private static byte[] BuildZip(Dictionary<string, string> entries)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                var e = zip.CreateEntry(name);
                using var w = new StreamWriter(e.Open(), Encoding.UTF8);
                w.Write(content);
            }
        }
        return ms.ToArray();
    }

    private static MultipartFormDataContent ZipForm(byte[] zipBytes, string fileName = "addon.zip")
    {
        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(zipBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        form.Add(fileContent, "file", fileName);
        return form;
    }

    private static string SampleManifest(string id = "demo-tile", string version = "1.0.0", bool includeScript = true) =>
        JsonSerializer.Serialize(new
        {
            id,
            name = "Demo Addon",
            version,
            description = "A test addon",
            author = "Tester",
            minHostVersion = "0.1.0",
            contributes = new
            {
                tiles = includeScript
                    ? new[]
                    {
                        new
                        {
                            id = "hello",
                            name = "Hello Tile",
                            description = "Says hello",
                            icon = "home",
                            element = new { tagName = "tw-demo-hello", script = "hello.js" },
                            defaultSize = new { w = 4, h = 2 }
                        }
                    }
                    : Array.Empty<object>(),
                addonSettingsSchema = new[]
                {
                    new { key = "apiUrl", label = "API URL", type = "url" },
                    new { key = "apiKey", label = "API Key", type = "secret" }
                }
            }
        });

    [Fact]
    public async Task ZipValidation_RejectsMissingManifest_ZipSlip_AndMissingReferencedFile()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();
        (await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

        // 1. Missing addon.json
        var noManifest = BuildZip(new() { ["readme.txt"] = "hi" });
        var r1 = await client.PostAsync("/api/addons/upload", ZipForm(noManifest));
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Contains("addon.json", await r1.Content.ReadAsStringAsync());

        // 2. Zip-slip traversal
        var zipSlip = BuildZip(new() { ["../evil.txt"] = "pwn", ["addon.json"] = SampleManifest() });
        var r2 = await client.PostAsync("/api/addons/upload", ZipForm(zipSlip));
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        Assert.Contains("Zip-slip", await r2.Content.ReadAsStringAsync());

        // 3. Missing referenced tile script
        var missingScript = BuildZip(new() { ["addon.json"] = SampleManifest() });
        var r3 = await client.PostAsync("/api/addons/upload", ZipForm(missingScript));
        Assert.Equal(HttpStatusCode.BadRequest, r3.StatusCode);
        Assert.Contains("missing script", await r3.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Install_Upgrade_Disable_Secrets_AndRecoveryOverride_WorkAcrossRestart()
    {
        // 1. Upload v1.0.0 in server instance #1
        using (var factory1 = new TilewrightFactory(_dataRoot))
        using (var client1 = factory1.CreateCookieClient())
        {
            (await client1.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

            var validZip = BuildZip(new()
            {
                ["addon.json"] = SampleManifest("demo-tile", "1.0.0"),
                ["hello.js"] = "export {};"
            });

            var uploadResp = await client1.PostAsync("/api/addons/upload", ZipForm(validZip));
            Assert.Equal(HttpStatusCode.OK, uploadResp.StatusCode);

            var overview = await client1.GetFromJsonAsync<AddonOverviewDto>("/api/addons");
            Assert.NotNull(overview);
            Assert.True(overview.RestartRequired);
            Assert.Contains(overview.Addons, a => a.Id == "demo-tile" && a.State == AddonStates.PendingInstall);
            // Built-in themes and MDI pack are present
            Assert.Contains(overview.Addons, a => a.Id == "themes-default" && a.BuiltIn);
            Assert.Contains(overview.Addons, a => a.Id == "icons-mdi" && a.BuiltIn);
        }

        // 2. Simulated restart #2: demo-tile is now installed & enabled
        using (var factory2 = new TilewrightFactory(_dataRoot))
        using (var client2 = factory2.CreateCookieClient())
        {
            var users = await client2.GetFromJsonAsync<List<JsonElement>>("/api/auth/users");
            var adminId = users![0].GetProperty("id").GetString()!;
            (await client2.PostAsJsonAsync("/api/auth/login", new { userId = adminId, password = "pw" })).EnsureSuccessStatusCode();

            var overview = await client2.GetFromJsonAsync<AddonOverviewDto>("/api/addons");
            Assert.NotNull(overview);
            Assert.Contains(overview.Addons, a => a.Id == "demo-tile" && a.State == AddonStates.Enabled);
            Assert.Contains(overview.AvailableTiles, t => t.AddonId == "demo-tile" && t.TileTypeId == "demo-tile:hello");

            // Same version re-upload is rejected; higher version is accepted as upgrade
            var sameVerZip = BuildZip(new() { ["addon.json"] = SampleManifest("demo-tile", "1.0.0"), ["hello.js"] = "export {};" });
            var clashResp = await client2.PostAsync("/api/addons/upload", ZipForm(sameVerZip));
            Assert.Equal(HttpStatusCode.BadRequest, clashResp.StatusCode);

            var upgradeZip = BuildZip(new() { ["addon.json"] = SampleManifest("demo-tile", "1.1.0"), ["hello.js"] = "export {};" });
            var upResp = await client2.PostAsync("/api/addons/upload", ZipForm(upgradeZip));
            Assert.Equal(HttpStatusCode.OK, upResp.StatusCode);
            var upJson = await upResp.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(upJson.GetProperty("isUpgrade").GetBoolean());

            // Save addon settings + write-only secret
            var saveSettings = await client2.PutAsJsonAsync("/api/addons/demo-tile/settings", new
            {
                settings = new { apiUrl = "https://example.local" },
                secrets = new { apiKey = "super-secret-token" }
            });
            Assert.Equal(HttpStatusCode.NoContent, saveSettings.StatusCode);

            var readSettings = await client2.GetFromJsonAsync<JsonElement>("/api/addons/demo-tile/settings");
            var rawJson = readSettings.GetRawText();
            Assert.DoesNotContain("super-secret-token", rawJson);
            Assert.True(readSettings.GetProperty("secretsSet").GetProperty("apiKey").GetBoolean());

            // Disable demo-tile
            var disResp = await client2.PostAsync("/api/addons/demo-tile/disable", null);
            Assert.Equal(HttpStatusCode.OK, disResp.StatusCode);
        }

        // 3. Simulated restart #3: demo-tile upgraded to 1.1.0 AND disabled (not in AvailableTiles)
        using (var factory3 = new TilewrightFactory(_dataRoot))
        using (var client3 = factory3.CreateCookieClient())
        {
            var users = await client3.GetFromJsonAsync<List<JsonElement>>("/api/auth/users");
            var adminId = users![0].GetProperty("id").GetString()!;
            (await client3.PostAsJsonAsync("/api/auth/login", new { userId = adminId, password = "pw" })).EnsureSuccessStatusCode();

            var overview = await client3.GetFromJsonAsync<AddonOverviewDto>("/api/addons");
            Assert.NotNull(overview);
            Assert.Contains(overview.Addons, a => a.Id == "demo-tile" && a.Version == "1.1.0" && a.State == AddonStates.Disabled);
            Assert.DoesNotContain(overview.AvailableTiles, t => t.AddonId == "demo-tile");
        }

        // 4. Recovery override via disabled-addons.txt forces themes-default off without UI
        await File.WriteAllTextAsync(Path.Combine(_dataRoot, "disabled-addons.txt"), "# emergency\nthemes-default\n");
        using (var factory4 = new TilewrightFactory(_dataRoot))
        using (var client4 = factory4.CreateCookieClient())
        {
            var users = await client4.GetFromJsonAsync<List<JsonElement>>("/api/auth/users");
            var adminId = users![0].GetProperty("id").GetString()!;
            (await client4.PostAsJsonAsync("/api/auth/login", new { userId = adminId, password = "pw" })).EnsureSuccessStatusCode();

            var overview = await client4.GetFromJsonAsync<AddonOverviewDto>("/api/addons");
            Assert.NotNull(overview);
            Assert.Contains(overview.Addons, a => a.Id == "themes-default" && a.State == AddonStates.Disabled && a.ForcedDisabled);
        }
    }

    [Fact]
    public async Task FailingAddon_IsMarkedFailed_AndDoesNotCrashHost()
    {
        var brokenDir = Path.Combine(_dataRoot, "addons-installed", "broken-addon");
        Directory.CreateDirectory(brokenDir);
        await File.WriteAllTextAsync(Path.Combine(brokenDir, "broken.dll"), "not a valid dotnet assembly");
        await File.WriteAllTextAsync(Path.Combine(brokenDir, "addon.json"), JsonSerializer.Serialize(new
        {
            id = "broken-addon",
            name = "Broken Addon",
            version = "1.0.0",
            description = "Has a corrupt dll",
            author = "Tester",
            minHostVersion = "0.1.0",
            contributes = new
            {
                server = new { assembly = "broken.dll", entryType = "Broken.Entry" }
            }
        }));

        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();
        (await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

        var overview = await client.GetFromJsonAsync<AddonOverviewDto>("/api/addons");
        Assert.NotNull(overview);
        var broken = overview.Addons.FirstOrDefault(a => a.Id == "broken-addon");
        Assert.NotNull(broken);
        Assert.Equal(AddonStates.Failed, broken.State);
        Assert.False(string.IsNullOrWhiteSpace(broken.Error));
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
