using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Tilewright.Server.Tests;

public sealed class TilewrightFactory : WebApplicationFactory<Program>
{
    public string DataRoot { get; }

    public TilewrightFactory(string? existingDataRoot = null)
    {
        DataRoot = existingDataRoot ?? Path.Combine(Path.GetTempPath(), $"tilewright-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(DataRoot);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Tilewright:DataRoot"] = DataRoot
            });
        });
    }

    public HttpClient CreateNoAutoCookieClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

    public HttpClient CreateCookieClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
}
