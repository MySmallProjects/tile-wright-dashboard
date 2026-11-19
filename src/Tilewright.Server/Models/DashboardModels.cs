using System.Text.Json;

namespace Tilewright.Server.Models;

public sealed class DashboardSummary
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Icon { get; set; }
    public int Order { get; set; }
    public BackgroundSettings? BackgroundOverride { get; set; }
}

public sealed class DashboardsIndexFile
{
    public List<DashboardSummary> Dashboards { get; set; } = [];
}

public sealed class TileLayoutItem
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public int X { get; set; }
    public int Y { get; set; }
    public int W { get; set; } = 2;
    public int H { get; set; } = 2;
    public bool Pinned { get; set; }
    public int Order { get; set; }
}

public sealed class DashboardLayoutFile
{
    public List<TileLayoutItem> Tiles { get; set; } = [];
}

public sealed record DashboardDetailDto(
    DashboardSummary Summary,
    List<TileLayoutItem> Tiles,
    Dictionary<string, JsonElement> TileSettings,
    Dictionary<string, JsonElement> TileData);
