using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Tilewright.Server.Models;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class DashboardAndVersionTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-dash-{Guid.NewGuid():N}");

    [Fact]
    public async Task VersionEndpoint_ReturnsStampedMetadata()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();

        var version = await client.GetFromJsonAsync<VersionInfo>("/api/version");
        Assert.NotNull(version);
        Assert.Contains("+", version.Version);
        Assert.True(version.BuildNumber > 0);
        Assert.False(string.IsNullOrWhiteSpace(version.BuildDate));
        Assert.False(string.IsNullOrWhiteSpace(version.MachineName));
        Assert.False(string.IsNullOrWhiteSpace(version.Configuration));
    }

    [Fact]
    public async Task Dashboards_CrudAndLayoutVsTileDataSeparation_Work()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();

        var setup = await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = (string?)null });
        setup.EnsureSuccessStatusCode();

        // New user starts with 1 empty dashboard ("Home")
        var initial = await client.GetFromJsonAsync<List<DashboardSummary>>("/api/dashboards");
        Assert.NotNull(initial);
        Assert.Single(initial);
        var homeId = initial[0].Id;

        // Cannot delete last remaining dashboard
        var delLast = await client.DeleteAsync($"/api/dashboards/{homeId}");
        Assert.Equal(HttpStatusCode.BadRequest, delLast.StatusCode);

        // Create second dashboard and save layout + separate tile data
        var createdResp = await client.PostAsJsonAsync("/api/dashboards", new { name = "Office", icon = "desk" });
        Assert.Equal(HttpStatusCode.Created, createdResp.StatusCode);
        var office = await createdResp.Content.ReadFromJsonAsync<DashboardSummary>();
        Assert.NotNull(office);

        var layoutResp = await client.PutAsJsonAsync($"/api/dashboards/{office.Id}/layout", new
        {
            tiles = new[]
            {
                new TileLayoutItem { Id = "note-1", Type = "notes", X = 0, Y = 0, W = 4, H = 3, Pinned = false, Order = 0 }
            }
        });
        layoutResp.EnsureSuccessStatusCode();

        // Save tile data independently of layout
        var dataResp = await client.PutAsJsonAsync($"/api/dashboards/{office.Id}/tiles/note-1/data", new
        {
            text = "Buy coffee beans"
        });
        dataResp.EnsureSuccessStatusCode();

        // Update layout (simulating Done/revert) — tile data remains intact
        var layoutResp2 = await client.PutAsJsonAsync($"/api/dashboards/{office.Id}/layout", new
        {
            tiles = new[]
            {
                new TileLayoutItem { Id = "note-1", Type = "notes", X = 2, Y = 1, W = 4, H = 3, Pinned = true, Order = 0 }
            }
        });
        layoutResp2.EnsureSuccessStatusCode();

        var detail = await client.GetFromJsonAsync<DashboardDetailDto>($"/api/dashboards/{office.Id}");
        Assert.NotNull(detail);
        Assert.Single(detail.Tiles);
        Assert.Equal(2, detail.Tiles[0].X);
        Assert.Equal("Buy coffee beans", detail.TileData["note-1"].GetProperty("text").GetString());

        // Path traversal attempt is rejected
        var traversal = await client.GetAsync($"/api/dashboards/{office.Id}/tiles/..%2Fsecret/data");
        Assert.Equal(HttpStatusCode.BadRequest, traversal.StatusCode);
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
