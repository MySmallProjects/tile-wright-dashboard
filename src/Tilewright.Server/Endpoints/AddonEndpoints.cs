using System.Text.Json;
using Microsoft.AspNetCore.StaticFiles;
using Tilewright.Server.Addons;

namespace Tilewright.Server.Endpoints;

public static class AddonEndpoints
{
    public sealed record SaveAddonSettingsRequest(
        Dictionary<string, JsonElement>? Settings,
        Dictionary<string, string?>? Secrets);

    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static IEndpointRouteBuilder MapAddonEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/addons").WithTags("Addons");

        group.MapGet("/", (AddonManager addons) => Results.Ok(addons.GetOverview()))
            .RequireAuthorization();

        group.MapGet("/{addonId}/assets/{**assetPath}", (string addonId, string assetPath, AddonManager addons) =>
        {
            var fullPath = addons.ResolveAssetPath(addonId, assetPath);
            if (fullPath is null) return Results.NotFound();

            if (!ContentTypes.TryGetContentType(fullPath, out var contentType))
            {
                contentType = Path.GetExtension(fullPath).Equals(".js", StringComparison.OrdinalIgnoreCase)
                    ? "application/javascript"
                    : "application/octet-stream";
            }

            return Results.File(fullPath, contentType);
        }).RequireAuthorization();

        group.MapPost("/upload", async (HttpRequest request, AddonManager addons, CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Multipart form upload expected." });
            }

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "No zip file provided." });
            }

            await using var stream = file.OpenReadStream();
            var result = await addons.StageInstallFromZipAsync(stream, file.Length, ct);
            if (!result.Success)
            {
                return Results.BadRequest(new { error = result.Error });
            }

            return Results.Ok(new
            {
                addonId = result.Manifest!.Id,
                name = result.Manifest.Name,
                version = result.Manifest.Version,
                isUpgrade = result.IsUpgrade,
                previousVersion = result.PreviousVersion,
                restartRequired = true
            });
        }).RequireAuthorization("AdminOnly").DisableAntiforgery();

        group.MapPost("/{addonId}/enable", async (string addonId, AddonManager addons, CancellationToken ct) =>
        {
            var ok = await addons.SetEnabledAsync(addonId, enabled: true, ct);
            return ok ? Results.Ok(new { addonId, enabled = true, restartRequired = true }) : Results.NotFound();
        }).RequireAuthorization("AdminOnly");

        group.MapPost("/{addonId}/disable", async (string addonId, AddonManager addons, CancellationToken ct) =>
        {
            var ok = await addons.SetEnabledAsync(addonId, enabled: false, ct);
            return ok ? Results.Ok(new { addonId, enabled = false, restartRequired = true }) : Results.NotFound();
        }).RequireAuthorization("AdminOnly");

        group.MapDelete("/{addonId}", async (string addonId, AddonManager addons) =>
        {
            var (ok, err) = await addons.MarkForRemovalAsync(addonId);
            return ok
                ? Results.Ok(new { addonId, pendingRemoval = true, restartRequired = true })
                : Results.BadRequest(new { error = err });
        }).RequireAuthorization("AdminOnly");

        group.MapPost("/restart", (IHostEnvironment env, IHostApplicationLifetime lifetime) =>
        {
            if (env.IsDevelopment())
            {
                return Results.Ok(new
                {
                    restarted = false,
                    development = true,
                    message = "Running in Development mode — please restart the server manually to apply pending addon changes."
                });
            }

            _ = Task.Run(async () =>
            {
                await Task.Delay(350);
                lifetime.StopApplication();
            });

            return Results.Accepted(value: new
            {
                restarted = true,
                development = false,
                message = "Server is stopping so systemd can restart it."
            });
        }).RequireAuthorization("AdminOnly");

        group.MapGet("/{addonId}/settings", async (string addonId, AddonManager addons, CancellationToken ct) =>
        {
            var data = await addons.GetAddonSettingsForAdminAsync(addonId, ct);
            if (data is null) return Results.NotFound();
            return Results.Ok(new { settings = data.Value.Settings, secretsSet = data.Value.SecretsSet });
        }).RequireAuthorization("AdminOnly");

        group.MapPut("/{addonId}/settings", async (
            string addonId,
            SaveAddonSettingsRequest req,
            AddonManager addons,
            CancellationToken ct) =>
        {
            var ok = await addons.SaveAddonSettingsAsync(
                addonId,
                req.Settings ?? [],
                req.Secrets,
                ct);
            return ok ? Results.NoContent() : Results.NotFound();
        }).RequireAuthorization("AdminOnly");

        group.MapGet("/{addonId}/options/{endpoint}", async (
            string addonId,
            string endpoint,
            AddonManager addons,
            CancellationToken ct) =>
        {
            var options = await addons.GetDynamicOptionsAsync(addonId, endpoint, ct);
            return Results.Ok(options);
        }).RequireAuthorization();

        group.MapPost("/{addonId}/actions/{action}", async (
            string addonId,
            string action,
            JsonElement? payload,
            AddonManager addons,
            CancellationToken ct) =>
        {
            var result = await addons.InvokeActionAsync(addonId, action, payload, ct);
            return Results.Ok(new { accepted = true, result });
        }).RequireAuthorization();

        return app;
    }
}
