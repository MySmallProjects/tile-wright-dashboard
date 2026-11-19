using System.Text.Json;
using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public sealed class JsonDashboardStore(JsonFileStore files, StoragePaths paths) : IDashboardStore
{
    public async Task<IReadOnlyList<DashboardSummary>> ListAsync(string userId, CancellationToken ct = default)
    {
        var index = await files.ReadAsync(paths.UserDashboardsIndexFile(userId), () => new DashboardsIndexFile(), ct);
        return index.Dashboards.OrderBy(d => d.Order).ToList();
    }

    public async Task<DashboardDetailDto?> GetAsync(string userId, string dashboardId, CancellationToken ct = default)
    {
        SafeId.Validate(dashboardId, nameof(dashboardId));
        var list = await ListAsync(userId, ct);
        var summary = list.FirstOrDefault(d => d.Id == dashboardId);
        if (summary is null) return null;

        var layout = await files.ReadAsync(
            paths.DashboardLayoutFile(userId, dashboardId),
            () => new DashboardLayoutFile(),
            ct);

        var tileSettings = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var tileData = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var tile in layout.Tiles)
        {
            if (!SafeId.IsValid(tile.Id)) continue;
            var settings = await GetTileSettingsAsync(userId, dashboardId, tile.Id, ct);
            if (settings.HasValue) tileSettings[tile.Id] = settings.Value;
            var data = await GetTileDataAsync(userId, dashboardId, tile.Id, ct);
            if (data.HasValue) tileData[tile.Id] = data.Value;
        }

        return new DashboardDetailDto(summary, layout.Tiles, tileSettings, tileData);
    }

    public async Task<DashboardSummary> CreateAsync(string userId, string name, string? icon = null, CancellationToken ct = default)
    {
        var summary = new DashboardSummary
        {
            Id = SafeId.NewId(),
            Name = string.IsNullOrWhiteSpace(name) ? "Dashboard" : name.Trim(),
            Icon = icon
        };

        await files.UpdateAsync(paths.UserDashboardsIndexFile(userId), () => new DashboardsIndexFile(), index =>
        {
            summary.Order = index.Dashboards.Count == 0 ? 0 : index.Dashboards.Max(d => d.Order) + 1;
            index.Dashboards.Add(summary);
        }, ct);

        Directory.CreateDirectory(paths.DashboardTilesDir(userId, summary.Id));
        Directory.CreateDirectory(paths.DashboardDataDir(userId, summary.Id));
        await files.WriteAsync(paths.DashboardLayoutFile(userId, summary.Id), new DashboardLayoutFile(), ct);

        return summary;
    }

    public Task<DashboardSummary?> UpdateMetadataAsync(
        string userId,
        string dashboardId,
        string name,
        string? icon,
        BackgroundSettings? backgroundOverride,
        bool? enabled = null,
        CancellationToken ct = default)
    {
        SafeId.Validate(dashboardId, nameof(dashboardId));
        return files.UpdateAsync(paths.UserDashboardsIndexFile(userId), () => new DashboardsIndexFile(), index =>
        {
            var dash = index.Dashboards.FirstOrDefault(d => d.Id == dashboardId);
            if (dash is null) return null;
            if (!string.IsNullOrWhiteSpace(name)) dash.Name = name.Trim();
            dash.Icon = icon;
            dash.BackgroundOverride = backgroundOverride;
            if (enabled.HasValue) dash.Enabled = enabled.Value;
            return dash;
        }, ct);
    }

    public async Task<IReadOnlyList<DashboardSummary>> ReorderAsync(
        string userId,
        IReadOnlyList<string> orderedIds,
        CancellationToken ct = default)
    {
        var updated = await files.UpdateAsync(paths.UserDashboardsIndexFile(userId), () => new DashboardsIndexFile(), index =>
        {
            var orderMap = orderedIds
                .Select((id, idx) => (id, idx))
                .GroupBy(x => x.id)
                .ToDictionary(g => g.Key, g => g.First().idx, StringComparer.Ordinal);

            var nextFallback = orderedIds.Count;
            foreach (var dash in index.Dashboards)
            {
                dash.Order = orderMap.TryGetValue(dash.Id, out var pos) ? pos : nextFallback++;
            }
            index.Dashboards = index.Dashboards.OrderBy(d => d.Order).ToList();
            for (var i = 0; i < index.Dashboards.Count; i++)
            {
                index.Dashboards[i].Order = i;
            }
        }, ct);

        return updated.Dashboards;
    }

    public async Task<DashboardSummary?> DuplicateAsync(
        string userId,
        string dashboardId,
        string? newName = null,
        CancellationToken ct = default)
    {
        SafeId.Validate(dashboardId, nameof(dashboardId));
        var source = await GetAsync(userId, dashboardId, ct);
        if (source is null) return null;

        var copyName = string.IsNullOrWhiteSpace(newName) ? $"{source.Summary.Name} (Copy)" : newName.Trim();
        var created = await CreateAsync(userId, copyName, source.Summary.Icon, ct);

        if (source.Summary.BackgroundOverride is not null)
        {
            await UpdateMetadataAsync(userId, created.Id, created.Name, created.Icon, source.Summary.BackgroundOverride, enabled: null, ct: ct);
        }

        await files.WriteAsync(
            paths.DashboardLayoutFile(userId, created.Id),
            new DashboardLayoutFile { Tiles = source.Tiles },
            ct);

        foreach (var (tileId, settings) in source.TileSettings)
        {
            await SaveTileSettingsAsync(userId, created.Id, tileId, settings, ct);
        }

        foreach (var (tileId, data) in source.TileData)
        {
            await SaveTileDataAsync(userId, created.Id, tileId, data, ct);
        }

        return created;
    }

    public async Task<bool> DeleteAsync(string userId, string dashboardId, CancellationToken ct = default)
    {
        SafeId.Validate(dashboardId, nameof(dashboardId));
        var removed = await files.UpdateAsync(paths.UserDashboardsIndexFile(userId), () => new DashboardsIndexFile(), index =>
        {
            var count = index.Dashboards.RemoveAll(d => d.Id == dashboardId);
            for (var i = 0; i < index.Dashboards.Count; i++)
            {
                index.Dashboards[i].Order = i;
            }
            return count > 0;
        }, ct);

        if (!removed) return false;

        var dir = paths.DashboardDir(userId, dashboardId);
        files.InvalidatePrefix(dir);
        if (Directory.Exists(dir))
        {
            Directory.Delete(dir, recursive: true);
        }
        return true;
    }

    public async Task<List<TileLayoutItem>?> SaveLayoutAsync(
        string userId,
        string dashboardId,
        List<TileLayoutItem> tiles,
        CancellationToken ct = default)
    {
        SafeId.Validate(dashboardId, nameof(dashboardId));
        var list = await ListAsync(userId, ct);
        if (list.All(d => d.Id != dashboardId)) return null;

        foreach (var tile in tiles)
        {
            SafeId.Validate(tile.Id, nameof(tile.Id));
        }

        await files.WriteAsync(
            paths.DashboardLayoutFile(userId, dashboardId),
            new DashboardLayoutFile { Tiles = tiles },
            ct);

        return tiles;
    }

    public async Task<JsonElement?> GetTileSettingsAsync(string userId, string dashboardId, string tileId, CancellationToken ct = default)
    {
        var path = paths.TileSettingsFile(userId, dashboardId, tileId);
        if (!File.Exists(path)) return null;
        return await files.ReadAsync<JsonElement?>(path, () => null, ct);
    }

    public Task SaveTileSettingsAsync(string userId, string dashboardId, string tileId, JsonElement settings, CancellationToken ct = default) =>
        files.WriteAsync(paths.TileSettingsFile(userId, dashboardId, tileId), settings, ct);

    public async Task<JsonElement?> GetTileDataAsync(string userId, string dashboardId, string tileId, CancellationToken ct = default)
    {
        var path = paths.TileDataFile(userId, dashboardId, tileId);
        if (!File.Exists(path)) return null;
        return await files.ReadAsync<JsonElement?>(path, () => null, ct);
    }

    public Task SaveTileDataAsync(string userId, string dashboardId, string tileId, JsonElement data, CancellationToken ct = default) =>
        files.WriteAsync(paths.TileDataFile(userId, dashboardId, tileId), data, ct);
}
