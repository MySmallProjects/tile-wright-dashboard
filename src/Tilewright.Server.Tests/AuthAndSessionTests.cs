using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Tilewright.Server.Models;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class AuthAndSessionTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-auth-{Guid.NewGuid():N}");

    [Fact]
    public async Task FirstRunSetup_CreatesAdmin_AndSessionSurvivesServerRestart()
    {
        string sessionCookieHeader;

        // First server instance
        using (var factory1 = new TilewrightFactory(_dataRoot))
        using (var client1 = factory1.CreateNoAutoCookieClient())
        {
            var statusBefore = await client1.GetFromJsonAsync<JsonElement>("/api/auth/status");
            Assert.True(statusBefore.GetProperty("needsSetup").GetBoolean());

            var setupResp = await client1.PostAsJsonAsync("/api/auth/setup", new
            {
                displayName = "Owner",
                password = "secret-password"
            });
            Assert.Equal(HttpStatusCode.Created, setupResp.StatusCode);

            // Second setup must be rejected
            var secondSetup = await client1.PostAsJsonAsync("/api/auth/setup", new
            {
                displayName = "Other",
                password = "x"
            });
            Assert.Equal(HttpStatusCode.Conflict, secondSetup.StatusCode);

            sessionCookieHeader = ExtractCookiePair(setupResp);
            Assert.StartsWith("tw_session=", sessionCookieHeader);
        }

        // Simulated server restart: brand-new WebApplicationFactory against the SAME DataRoot
        using (var factory2 = new TilewrightFactory(_dataRoot))
        using (var client2 = factory2.CreateNoAutoCookieClient())
        {
            var req = new HttpRequestMessage(HttpMethod.Get, "/api/auth/status");
            req.Headers.Add("Cookie", sessionCookieHeader);

            var resp = await client2.SendAsync(req);
            resp.EnsureSuccessStatusCode();
            var statusAfter = await resp.Content.ReadFromJsonAsync<JsonElement>();

            Assert.False(statusAfter.GetProperty("needsSetup").GetBoolean());
            Assert.True(statusAfter.GetProperty("authenticated").GetBoolean());
            Assert.Equal("Owner", statusAfter.GetProperty("user").GetProperty("displayName").GetString());
        }
    }

    [Fact]
    public async Task UserRemoval_AndPasswordReset_RevokeExistingSessions()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var adminClient = factory.CreateCookieClient();

        // Setup admin
        var setup = await adminClient.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw1" });
        setup.EnsureSuccessStatusCode();

        // Admin creates a no-password tablet user
        var createResp = await adminClient.PostAsJsonAsync("/api/users", new
        {
            displayName = "Wall Tablet",
            role = UserRoles.User,
            password = (string?)null
        });
        Assert.Equal(HttpStatusCode.Created, createResp.StatusCode);
        var tabletUser = await createResp.Content.ReadFromJsonAsync<PublicUserDto>();
        Assert.NotNull(tabletUser);
        Assert.False(tabletUser.HasPassword);

        // Tablet logs in without password
        using var tabletClient = factory.CreateCookieClient();
        var loginResp = await tabletClient.PostAsJsonAsync("/api/auth/login", new { userId = tabletUser.Id, password = (string?)null });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);

        // Tablet cannot access admin-only endpoint
        var forbiddenResp = await tabletClient.GetAsync("/api/users");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResp.StatusCode);

        // Tablet can access own dashboards
        var dashResp = await tabletClient.GetAsync("/api/dashboards");
        Assert.Equal(HttpStatusCode.OK, dashResp.StatusCode);

        // Admin sets a password on tablet user -> revokes tablet's session
        var resetResp = await adminClient.PutAsJsonAsync($"/api/users/{tabletUser.Id}/password", new { newPassword = "newpw" });
        Assert.Equal(HttpStatusCode.NoContent, resetResp.StatusCode);

        var afterReset = await tabletClient.GetAsync("/api/dashboards");
        Assert.Equal(HttpStatusCode.Unauthorized, afterReset.StatusCode);

        // Tablet logs back in with new password
        var relogin = await tabletClient.PostAsJsonAsync("/api/auth/login", new { userId = tabletUser.Id, password = "newpw" });
        Assert.Equal(HttpStatusCode.OK, relogin.StatusCode);

        // Admin deletes tablet user -> revokes tablet's session
        var delResp = await adminClient.DeleteAsync($"/api/users/{tabletUser.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delResp.StatusCode);

        var afterDelete = await tabletClient.GetAsync("/api/dashboards");
        Assert.Equal(HttpStatusCode.Unauthorized, afterDelete.StatusCode);
    }

    [Fact]
    public async Task FailedPasswordAttempts_AreThrottledWith429()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = factory.CreateNoAutoCookieClient();

        var setup = await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "correct" });
        var admin = await setup.Content.ReadFromJsonAsync<PublicUserDto>();
        Assert.NotNull(admin);

        for (var i = 0; i < 5; i++)
        {
            var bad = await client.PostAsJsonAsync("/api/auth/login", new { userId = admin.Id, password = "wrong" });
            Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        }

        var throttled = await client.PostAsJsonAsync("/api/auth/login", new { userId = admin.Id, password = "wrong" });
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    private static string ExtractCookiePair(HttpResponseMessage response)
    {
        var setCookie = response.Headers.GetValues("Set-Cookie").First();
        return setCookie.Split(';', 2)[0];
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
