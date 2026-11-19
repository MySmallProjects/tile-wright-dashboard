using System.Text.Json;
using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public interface IDashboardStore
{
    Task<IReadOnlyList<DashboardSummary>> ListAsync(string userId, CancellationToken ct = default);
    Task<DashboardDetailDto?> GetAsync(string userId, string dashboardId, CancellationToken ct = default);
    Task<DashboardSummary> CreateAsync(string userId, string name, string? icon = null, CancellationToken ct = default);
    Task<DashboardSummary?> UpdateMetadataAsync(
        string userId,
        string dashboardId,
        string name,
        string? icon,
        BackgroundSettings? backgroundOverride,
        CancellationToken ct = default);
    Task<IReadOnlyList<DashboardSummary>> ReorderAsync(string userId, IReadOnlyList<string> orderedIds, CancellationToken ct = default);
    Task<DashboardSummary?> DuplicateAsync(string userId, string dashboardId, string? newName = null, CancellationToken ct = default);
    Task<bool> DeleteAsync(string userId, string dashboardId, CancellationToken ct = default);
    Task<List<TileLayoutItem>?> SaveLayoutAsync(string userId, string dashboardId, List<TileLayoutItem> tiles, CancellationToken ct = default);
    Task<JsonElement?> GetTileSettingsAsync(string userId, string dashboardId, string tileId, CancellationToken ct = default);
    Task SaveTileSettingsAsync(string userId, string dashboardId, string tileId, JsonElement settings, CancellationToken ct = default);
    Task<JsonElement?> GetTileDataAsync(string userId, string dashboardId, string tileId, CancellationToken ct = default);
    Task SaveTileDataAsync(string userId, string dashboardId, string tileId, JsonElement data, CancellationToken ct = default);
}
