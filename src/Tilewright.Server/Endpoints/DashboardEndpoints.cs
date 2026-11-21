using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Tilewright.Server.Addons;
using Tilewright.Server.Models;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static partial class DashboardEndpoints
{
    private const long MaxDashboardImportBytes = 5 * 1024 * 1024;
    private static readonly JsonSerializerOptions ExportJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };
    private static readonly JsonSerializerOptions ImportJsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    [GeneratedRegex("[^a-z0-9]+", RegexOptions.Compiled)]
    private static partial Regex SlugRegex();
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

        group.MapGet("/{id}/export", async (
            string id,
            HttpContext http,
            IDashboardStore store,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            var userId = GetUserId(http);
            var detail = await store.GetAsync(userId, id, ct);
            if (detail is null) return Results.NotFound();

            var export = new DashboardExportFile(
                Version: 1,
                ExportedAt: DateTimeOffset.UtcNow,
                Name: detail.Summary.Name,
                Icon: detail.Summary.Icon,
                BackgroundOverride: detail.Summary.BackgroundOverride,
                Tiles: detail.Tiles,
                TileSettings: detail.TileSettings,
                TileData: detail.TileData);

            var json = JsonSerializer.Serialize(export, ExportJsonOptions);
            var bytes = Encoding.UTF8.GetBytes(json);
            var slug = SlugRegex().Replace(detail.Summary.Name.ToLowerInvariant(), "-").Trim('-');
            if (string.IsNullOrEmpty(slug)) slug = "dashboard";
            var fileName = $"tilewright-dashboard-{slug}-{DateTime.UtcNow:yyyy-MM-dd}.json";
            return Results.File(bytes, "application/json", fileName);
        });

        group.MapPost("/{id}/import", async (
            string id,
            HttpRequest request,
            HttpContext http,
            IDashboardStore store,
            AddonManager addons,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid dashboard id." });
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Expected multipart/form-data upload." });
            }

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "No dashboard JSON file was uploaded." });
            }

            if (file.Length > MaxDashboardImportBytes)
            {
                return Results.BadRequest(new { error = "Dashboard file exceeds 5 MB limit." });
            }

            DashboardExportFile? imported;
            try
            {
                await using var stream = file.OpenReadStream();
                imported = await JsonSerializer.DeserializeAsync<DashboardExportFile>(stream, ImportJsonOptions, ct);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Invalid JSON file." });
            }

            if (imported is null || imported.Version != 1 || string.IsNullOrWhiteSpace(imported.Name) || imported.Tiles is null)
            {
                return Results.BadRequest(new { error = "Invalid dashboard backup format. Expected a Tilewright v1 dashboard JSON file." });
            }

            if (imported.Tiles.Any(t => string.IsNullOrWhiteSpace(t.Type)))
            {
                return Results.BadRequest(new { error = "One or more tiles in the uploaded file are missing a tile type." });
            }

            var newTiles = new List<TileLayoutItem>(imported.Tiles.Count);
            var newTileSettings = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            var newTileData = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

            foreach (var tile in imported.Tiles)
            {
                var newTileId = SafeId.NewId();
                newTiles.Add(new TileLayoutItem
                {
                    Id = newTileId,
                    Type = tile.Type.Trim(),
                    X = tile.X,
                    Y = tile.Y,
                    W = tile.W > 0 ? tile.W : 2,
                    H = tile.H > 0 ? tile.H : 2,
                    Pinned = tile.Pinned,
                    Order = tile.Order
                });

                if (!string.IsNullOrEmpty(tile.Id))
                {
                    if (imported.TileSettings is not null && imported.TileSettings.TryGetValue(tile.Id, out var settings))
                    {
                        newTileSettings[newTileId] = settings;
                    }
                    if (imported.TileData is not null && imported.TileData.TryGetValue(tile.Id, out var data))
                    {
                        newTileData[newTileId] = data;
                    }
                }
            }

            var userId = GetUserId(http);
            var updated = await store.ReplaceDashboardAsync(
                userId,
                id,
                imported.Name.Trim(),
                imported.Icon,
                imported.BackgroundOverride,
                newTiles,
                newTileSettings,
                newTileData,
                ct);

            if (updated is null) return Results.NotFound();

            var availableTypes = addons.GetOverview().AvailableTiles
                .Select(t => t.TileTypeId)
                .ToHashSet(StringComparer.Ordinal);
            var missingTileTypes = newTiles
                .Select(t => t.Type)
                .Where(t => !availableTypes.Contains(t))
                .Distinct(StringComparer.Ordinal)
                .OrderBy(t => t, StringComparer.Ordinal)
                .ToList();

            return Results.Ok(new
            {
                dashboard = updated,
                tileCount = newTiles.Count,
                missingTileTypes
            });
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
