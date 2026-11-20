using System.Text.Json;
using Microsoft.Extensions.Logging;
using Tilewright.AddonContracts;

namespace Tilewright.Addons.BuiltIn;

public sealed class HttpGetAddonModule : IAddonModule, IActionHandler
{
    public IActionHandler ActionHandler => this;

    public Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default) => Task.CompletedTask;

    public async Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default)
    {
        if (!string.Equals(action, "trigger-get", StringComparison.OrdinalIgnoreCase) || payload is null)
        {
            return new { ok = false, error = "Unknown action." };
        }

        var url = payload.Value.ValueKind == JsonValueKind.Object &&
                  payload.Value.TryGetProperty("url", out var u) &&
                  u.ValueKind == JsonValueKind.String
            ? u.GetString()?.Trim()
            : null;

        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return new { ok = false, needsSetup = true, error = "Configure a valid HTTP/HTTPS URL." };
        }

        try
        {
            var client = host.Http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            req.Headers.TryAddWithoutValidation("User-Agent", "Tilewright/1.0");

            var addonSettings = await host.Settings.GetAddonSettingsAsync(ct);
            var headerName = addonSettings.TryGetValue("authHeaderName", out var hn) ? hn.GetString() : null;
            var headerVal = await host.Secrets.GetSecretAsync("authHeaderValue", ct);
            if (!string.IsNullOrWhiteSpace(headerName) && !string.IsNullOrWhiteSpace(headerVal))
            {
                req.Headers.TryAddWithoutValidation(headerName.Trim(), headerVal);
            }

            using var resp = await client.SendAsync(req, ct);
            return new
            {
                ok = resp.IsSuccessStatusCode,
                statusCode = (int)resp.StatusCode
            };
        }
        catch (Exception ex)
        {
            host.Logger.LogWarning(ex, "HTTP GET request failed for {Url}", url);
            return new { ok = false, error = ex.Message };
        }
    }
}
