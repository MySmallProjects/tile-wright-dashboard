using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Tilewright.Server.Models;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class DashboardExportImportTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-dash-io-{Guid.NewGuid():N}");

    [Fact]
    public async Task ExportAndImport_ReplacesDashboardCompletelyAndReportsMissingAddons()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var adminClient = factory.CreateCookieClient();
        using var userClient = factory.CreateCookieClient();

        (await adminClient.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

        // Create a normal (non-admin) user
        var createUserResp = await adminClient.PostAsJsonAsync("/api/users", new
        {
            displayName = "Alice",
            password = "pw",
            isAdmin = false
        });
        createUserResp.EnsureSuccessStatusCode();
        var alice = await createUserResp.Content.ReadFromJsonAsync<JsonElement>();
        var aliceId = alice.GetProperty("id").GetString();
        Assert.False(string.IsNullOrEmpty(aliceId));

        // Admin configures their dashboard with metadata, background, tile, settings, data, and a missing tile type
        var adminDashes = await adminClient.GetFromJsonAsync<List<DashboardSummary>>("/api/dashboards");
        var adminDashId = adminDashes![0].Id;

        (await adminClient.PutAsJsonAsync($"/api/dashboards/{adminDashId}", new
        {
            name = "Shared Kitchen",
            icon = "silverware-fork-knife",
            backgroundOverride = new BackgroundSettings { Mode = "solid", Color = "#123456" }
        })).EnsureSuccessStatusCode();

        (await adminClient.PutAsJsonAsync($"/api/dashboards/{adminDashId}/layout", new
        {
            tiles = new[]
            {
                new TileLayoutItem { Id = "orig-1", Type = "clock:clock", X = 1, Y = 2, W = 4, H = 2 },
                new TileLayoutItem { Id = "orig-2", Type = "missing-addon:widget", X = 5, Y = 2, W = 2, H = 2 }
            }
        })).EnsureSuccessStatusCode();

        (await adminClient.PutAsJsonAsync($"/api/dashboards/{adminDashId}/tiles/orig-1/settings", new { format24h = true })).EnsureSuccessStatusCode();
        (await adminClient.PutAsJsonAsync($"/api/dashboards/{adminDashId}/tiles/orig-1/data", new { label = "Kitchen Clock" })).EnsureSuccessStatusCode();

        // Export JSON
        var exportResp = await adminClient.GetAsync($"/api/dashboards/{adminDashId}/export");
        Assert.Equal(HttpStatusCode.OK, exportResp.StatusCode);
        var exportBytes = await exportResp.Content.ReadAsByteArrayAsync();

        // Alice logs in and sets an existing tile on her dashboard that should be wiped by import
        (await userClient.PostAsJsonAsync("/api/auth/login", new { userId = aliceId, password = "pw" })).EnsureSuccessStatusCode();
        var aliceDashes = await userClient.GetFromJsonAsync<List<DashboardSummary>>("/api/dashboards");
        var aliceDashId = aliceDashes![0].Id;

        (await userClient.PutAsJsonAsync($"/api/dashboards/{aliceDashId}/layout", new
        {
            tiles = new[] { new TileLayoutItem { Id = "old-tile", Type = "clock:clock", W = 2, H = 2 } }
        })).EnsureSuccessStatusCode();
        (await userClient.PutAsJsonAsync($"/api/dashboards/{aliceDashId}/tiles/old-tile/settings", new { stale = true })).EnsureSuccessStatusCode();

        // Alice imports the exported JSON into her dashboard
        using var form = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(exportBytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/json");
        form.Add(fileContent, "file", "shared.json");

        var importResp = await userClient.PostAsync($"/api/dashboards/{aliceDashId}/import", form);
        Assert.Equal(HttpStatusCode.OK, importResp.StatusCode);

        var importResult = await importResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, importResult.GetProperty("tileCount").GetInt32());
        var missing = importResult.GetProperty("missingTileTypes").EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Contains("missing-addon:widget", missing);

        // Verify Alice's dashboard was completely replaced
        var aliceDetail = await userClient.GetFromJsonAsync<DashboardDetailDto>($"/api/dashboards/{aliceDashId}");
        Assert.NotNull(aliceDetail);
        Assert.Equal("Shared Kitchen", aliceDetail!.Summary.Name);
        Assert.Equal("silverware-fork-knife", aliceDetail.Summary.Icon);
        Assert.Equal("solid", aliceDetail.Summary.BackgroundOverride?.Mode);
        Assert.Equal("#123456", aliceDetail.Summary.BackgroundOverride?.Color);

        Assert.Equal(2, aliceDetail.Tiles.Count);
        Assert.DoesNotContain(aliceDetail.Tiles, t => t.Id == "old-tile");
        Assert.DoesNotContain(aliceDetail.Tiles, t => t.Id == "orig-1");

        var importedClock = aliceDetail.Tiles.Single(t => t.Type == "clock:clock");
        Assert.True(aliceDetail.TileSettings[importedClock.Id].GetProperty("format24h").GetBoolean());
        Assert.Equal("Kitchen Clock", aliceDetail.TileData[importedClock.Id].GetProperty("label").GetString());
        Assert.False(aliceDetail.TileSettings.ContainsKey("old-tile"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
