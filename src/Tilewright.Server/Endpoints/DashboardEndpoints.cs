using System.Security.Claims;
using System.Text.Json;
using Tilewright.Server.Models;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static class DashboardEndpoints
{
    public sealed record CreateDashboardRequest(string Name, string? Icon);
    public sealed record UpdateDashboardRequest(string Name, string? Icon, BackgroundSettings? BackgroundOverride, bool? Enabled = null);
    public sealed record ReorderDashboardsRequest(List<string> OrderedIds);
    public sealed record DuplicateDashboardRequest(string? Name);
    public sealed record SaveLayoutRequest(List<TileLayoutItem> Tiles);

    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/dashboards")
            .WithTags("Dashboards")
            .RequireAuthorization();

        group.MapGet("/", async (HttpContext http, IDashboardStore store, CancellationToken ct) =>
        {
            var userId = GetUserId(http);
            var list = await store.ListAsync(userId, ct);
            return Results.Ok(list);
        });

        group.MapPost("/", async (CreateDashboardRequest req, HttpContext http, IDashboardStore store, CancellationToken ct) =>
        {
            var userId = GetUserId(http);
            var created = await store.CreateAsync(userId, req.Name, req.Icon, ct);
            return Results.Created($"/api/dashboards/{created.Id}", created);
        });

        group.MapPut("/reorder", async (ReorderDashboardsRequest req, HttpContext http, IDashboardStore store, CancellationToken ct) =>
        {
            var userId = GetUserId(http);
            var updated = await store.ReorderAsync(userId, req.OrderedIds ?? [], ct);
            return Results.Ok(updated);
        });

        group.MapGet("/{id}", async (string id, HttpContext http, IDashboardStore store, CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            var userId = GetUserId(http);
            var detail = await store.GetAsync(userId, id, ct);
            return detail is null ? Results.NotFound() : Results.Ok(detail);
        });

        group.MapPut("/{id}", async (
            string id,
            UpdateDashboardRequest req,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            var userId = GetUserId(http);

            if (req.Enabled == false)
            {
                var all = await store.ListAsync(userId, ct);
                var enabledCount = all.Count(d => d.Enabled);
                var target = all.FirstOrDefault(d => d.Id == id);
                if (target is not null && target.Enabled && enabledCount <= 1)
                {
                    return Results.BadRequest(new { error = "Cannot disable the last enabled dashboard." });
                }
            }

            var updated = await store.UpdateMetadataAsync(userId, id, req.Name, req.Icon, req.BackgroundOverride, req.Enabled, ct);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        });

        group.MapPost("/{id}/duplicate", async (
            string id,
            DuplicateDashboardRequest? req,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            var userId = GetUserId(http);
            var copy = await store.DuplicateAsync(userId, id, req?.Name, ct);
            return copy is null ? Results.NotFound() : Results.Created($"/api/dashboards/{copy.Id}", copy);
        });

        group.MapDelete("/{id}", async (string id, HttpContext http, IDashboardStore store, CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            var userId = GetUserId(http);
            var all = await store.ListAsync(userId, ct);
            var target = all.FirstOrDefault(d => d.Id == id);
            if (target is null) return Results.NotFound();

            if (all.Count <= 1)
            {
                return Results.BadRequest(new { error = "Cannot delete the last remaining dashboard." });
            }

            if (target.Enabled && all.Count(d => d.Enabled) <= 1)
            {
                return Results.BadRequest(new { error = "Cannot delete the last enabled dashboard. Enable another dashboard first." });
            }

            var deleted = await store.DeleteAsync(userId, id, ct);
            return deleted ? Results.NoContent() : Results.NotFound();
        });

        group.MapPut("/{id}/layout", async (
            string id,
            SaveLayoutRequest req,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            var tiles = req.Tiles ?? [];
            if (tiles.Any(t => !SafeId.IsValid(t.Id)))
            {
                return Results.BadRequest(new { error = "One or more tile ids are invalid." });
            }

            var userId = GetUserId(http);
            var saved = await store.SaveLayoutAsync(userId, id, tiles, ct);
            return saved is null ? Results.NotFound() : Results.Ok(saved);
        });

        group.MapGet("/{id}/tiles/{tileId}/settings", async (
            string id,
            string tileId,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id) || !SafeId.IsValid(tileId))
            {
                return Results.BadRequest(new { error = "Invalid dashboard or tile id." });
            }

            var userId = GetUserId(http);
            var settings = await store.GetTileSettingsAsync(userId, id, tileId, ct);
            return settings.HasValue ? Results.Ok(settings.Value) : Results.NotFound();
        });

        group.MapPut("/{id}/tiles/{tileId}/settings", async (
            string id,
            string tileId,
            JsonElement settings,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id) || !SafeId.IsValid(tileId))
            {
                return Results.BadRequest(new { error = "Invalid dashboard or tile id." });
            }

            var userId = GetUserId(http);
            await store.SaveTileSettingsAsync(userId, id, tileId, settings, ct);
            return Results.Ok(settings);
        });

        group.MapGet("/{id}/tiles/{tileId}/data", async (
            string id,
            string tileId,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id) || !SafeId.IsValid(tileId))
            {
                return Results.BadRequest(new { error = "Invalid dashboard or tile id." });
            }

            var userId = GetUserId(http);
            var data = await store.GetTileDataAsync(userId, id, tileId, ct);
            return data.HasValue ? Results.Ok(data.Value) : Results.NotFound();
        });

        group.MapPut("/{id}/tiles/{tileId}/data", async (
            string id,
            string tileId,
            JsonElement data,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id) || !SafeId.IsValid(tileId))
            {
                return Results.BadRequest(new { error = "Invalid dashboard or tile id." });
            }

            var userId = GetUserId(http);
            await store.SaveTileDataAsync(userId, id, tileId, data, ct);
            return Results.Ok(data);
        });

        return app;
    }

    private static string GetUserId(HttpContext http) =>
        http.User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Authenticated user id claim is missing.");
}
