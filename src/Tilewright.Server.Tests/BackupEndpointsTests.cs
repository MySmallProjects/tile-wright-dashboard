using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Tilewright.Server.Models;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class BackupEndpointsTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-backup-{Guid.NewGuid():N}");

    [Fact]
    public async Task SiteBackup_ExcludesUsersAndSessions_AndRestoreWithClearFirstWorks()
    {
        byte[] backupBytes;

        using (var factory1 = new TilewrightFactory(_dataRoot))
        using (var client1 = factory1.CreateCookieClient())
        {
            (await client1.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();
            (await client1.PutAsJsonAsync("/api/site", new SiteSettings { DefaultTheme = "dark" })).EnsureSuccessStatusCode();

            var dashes = await client1.GetFromJsonAsync<List<DashboardSummary>>("/api/dashboards");
            var dashId = dashes![0].Id;
            (await client1.PutAsJsonAsync($"/api/dashboards/{dashId}/layout", new
            {
                tiles = new[] { new TileLayoutItem { Id = "t1", Type = "clock:clock", W = 4, H = 2 } }
            })).EnsureSuccessStatusCode();

            // Put a secret on disk
            var secretFile = Path.Combine(_dataRoot, "secrets", "demo.json");
            await File.WriteAllTextAsync(secretFile, """{"values":{"apiKey":"secret123"}}""");

            var resp = await client1.GetAsync("/api/backup/site");
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            backupBytes = await resp.Content.ReadAsByteArrayAsync();

            using var zip = new ZipArchive(new MemoryStream(backupBytes), ZipArchiveMode.Read);
            var names = zip.Entries.Select(e => e.FullName).ToHashSet(StringComparer.Ordinal);
            Assert.Contains("tilewright-backup.json", names);
            Assert.Contains("site.json", names);
            Assert.Contains("secrets/demo.json", names);
            Assert.DoesNotContain("users.json", names);
            Assert.DoesNotContain("sessions.json", names);

            // Change site theme to light and clear dashboards
            (await client1.PutAsJsonAsync("/api/site", new SiteSettings { DefaultTheme = "light" })).EnsureSuccessStatusCode();
            var clearResp = await client1.PostAsync("/api/backup/clear-dashboards", null);
            Assert.Equal(HttpStatusCode.OK, clearResp.StatusCode);

            var afterClearDashes = await client1.GetFromJsonAsync<List<DashboardSummary>>("/api/dashboards");
            Assert.Single(afterClearDashes!);
            var afterClearDetail = await client1.GetFromJsonAsync<DashboardDetailDto>($"/api/dashboards/{afterClearDashes![0].Id}");
            Assert.Empty(afterClearDetail!.Tiles);

            // Restore with clearFirst=true
            using var form = new MultipartFormDataContent();
            var content = new ByteArrayContent(backupBytes);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
            form.Add(content, "file", "backup.zip");

            var restoreResp = await client1.PostAsync("/api/backup/restore?clearFirst=true", form);
            Assert.Equal(HttpStatusCode.OK, restoreResp.StatusCode);

            var siteAfter = await client1.GetFromJsonAsync<SiteSettings>("/api/site");
            Assert.Equal("dark", siteAfter!.DefaultTheme);

            var restoredDetail = await client1.GetFromJsonAsync<DashboardDetailDto>($"/api/dashboards/{dashId}");
            Assert.Single(restoredDetail!.Tiles);
        }
    }

    [Fact]
    public async Task UsersBackupAndRestore_ValidatesAdminAndRevokesSessions()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();
        (await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

        // Download users.json
        var dlResp = await client.GetAsync("/api/backup/users");
        Assert.Equal(HttpStatusCode.OK, dlResp.StatusCode);
        var usersJson = await dlResp.Content.ReadAsStringAsync();
        Assert.Contains("Admin", usersJson);

        // Reject users file with no admin
        var noAdminJson = """{"users":[{"id":"u1","displayName":"UserOnly","role":"user"}]}""";
        using (var badForm = new MultipartFormDataContent())
        {
            badForm.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(noAdminJson)), "file", "users.json");
            var badResp = await client.PostAsync("/api/backup/users", badForm);
            Assert.Equal(HttpStatusCode.BadRequest, badResp.StatusCode);
        }

        // Valid users import succeeds and revokes current session
        using var goodForm = new MultipartFormDataContent();
        goodForm.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(usersJson)), "file", "users.json");
        var okResp = await client.PostAsync("/api/backup/users", goodForm);
        Assert.Equal(HttpStatusCode.OK, okResp.StatusCode);

        var afterImport = await client.GetAsync("/api/dashboards");
        Assert.Equal(HttpStatusCode.Unauthorized, afterImport.StatusCode);
    }

    [Fact]
    public async Task SiteReset_WipesAllDataAndUploadedAddons_ReturningToFirstRunSetup()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateCookieClient();
        (await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" })).EnsureSuccessStatusCode();

        // Simulate an uploaded addon and a secret
        var uploadedDir = Path.Combine(_dataRoot, "addons-installed", "custom-addon");
        Directory.CreateDirectory(uploadedDir);
        await File.WriteAllTextAsync(Path.Combine(uploadedDir, "addon.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(_dataRoot, "secrets", "custom.json"), "{}");

        var resetResp = await client.PostAsync("/api/backup/reset-site", null);
        Assert.Equal(HttpStatusCode.OK, resetResp.StatusCode);

        Assert.False(Directory.Exists(uploadedDir));
        Assert.False(File.Exists(Path.Combine(_dataRoot, "secrets", "custom.json")));

        var status = await client.GetFromJsonAsync<JsonElement>("/api/auth/status");
        Assert.True(status.GetProperty("needsSetup").GetBoolean());
        Assert.False(status.GetProperty("authenticated").GetBoolean());
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
