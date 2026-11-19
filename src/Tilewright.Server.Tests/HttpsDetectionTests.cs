using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Tilewright.Server.Tests;

public sealed class HttpsDetectionTests : IDisposable
{
    private readonly string _dataRoot = Path.Combine(Path.GetTempPath(), $"tw-https-{Guid.NewGuid():N}");

    private sealed class RemoteIpStartupFilter(IPAddress remoteIp) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, nextMiddleware) =>
            {
                ctx.Connection.RemoteIpAddress = remoteIp;
                await nextMiddleware();
            });
            next(app);
        };
    }

    private HttpClient CreateClientWithRemoteIp(TilewrightFactory baseFactory, IPAddress remoteIp)
    {
        var customized = baseFactory.WithWebHostBuilder(b =>
        {
            b.ConfigureServices(services => services.AddSingleton<IStartupFilter>(new RemoteIpStartupFilter(remoteIp)));
        });
        return customized.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            HandleCookies = false
        });
    }

    [Fact]
    public async Task PlainHttp_OmitsSecureFlagAndHsts()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = CreateClientWithRemoteIp(factory, IPAddress.Loopback);

        var resp = await client.PostAsJsonAsync("/api/auth/setup", new { displayName = "Admin", password = "pw" });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var setCookie = string.Join("; ", resp.Headers.GetValues("Set-Cookie"));
        Assert.Contains("tw_session=", setCookie);
        Assert.DoesNotContain("__Host-", setCookie);
        Assert.DoesNotContain("secure", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.False(resp.Headers.Contains("Strict-Transport-Security"));
    }

    [Fact]
    public async Task ForwardedHttpsFromLocalhostProxy_SetsSecureHostCookieAndHsts()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = CreateClientWithRemoteIp(factory, IPAddress.Loopback);

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/setup")
        {
            Content = JsonContent.Create(new { displayName = "Admin", password = "pw" })
        };
        req.Headers.Add("X-Forwarded-Proto", "https");

        var resp = await client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var setCookie = string.Join("; ", resp.Headers.GetValues("Set-Cookie"));
        Assert.Contains("__Host-tw_session=", setCookie);
        Assert.Contains("secure", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.True(resp.Headers.Contains("Strict-Transport-Security"));
    }

    [Fact]
    public async Task SpoofedForwardedHttpsFromLanClient_IsIgnored()
    {
        using var factory = new TilewrightFactory(_dataRoot);
        using var client = CreateClientWithRemoteIp(factory, IPAddress.Parse("192.168.1.50"));

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/setup")
        {
            Content = JsonContent.Create(new { displayName = "Admin", password = "pw" })
        };
        req.Headers.Add("X-Forwarded-Proto", "https");

        var resp = await client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var setCookie = string.Join("; ", resp.Headers.GetValues("Set-Cookie"));
        Assert.Contains("tw_session=", setCookie);
        Assert.DoesNotContain("__Host-", setCookie);
        Assert.DoesNotContain("secure", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.False(resp.Headers.Contains("Strict-Transport-Security"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_dataRoot))
        {
            Directory.Delete(_dataRoot, recursive: true);
        }
    }
}
