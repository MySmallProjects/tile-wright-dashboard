using System.Text.Json;
using System.Text.RegularExpressions;

namespace Tilewright.Server.Addons;

public static partial class AddonIdValidator
{
    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,48}$", RegexOptions.Compiled)]
    private static partial Regex Pattern();

    public static bool IsValid(string? id) => !string.IsNullOrWhiteSpace(id) && Pattern().IsMatch(id);
}

public static class AddonStates
{
    public const string Enabled = "enabled";
    public const string Disabled = "disabled";
    public const string Failed = "failed";
    public const string PendingInstall = "pending-install";
    public const string PendingRemoval = "pending-removal";
}

public sealed class AddonManifest
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string MinHostVersion { get; set; } = "0.1.0";
    public AddonContributions Contributes { get; set; } = new();
}

public sealed class AddonContributions
{
    public List<TileTypeContribution> Tiles { get; set; } = [];
    public ServerContribution? Server { get; set; }
    public List<ThemeContribution> Themes { get; set; } = [];
    public List<IconPackContribution> IconPacks { get; set; } = [];
    public List<SettingsTabContribution> SettingsTabs { get; set; } = [];
    public List<SettingsFieldSchema> AddonSettingsSchema { get; set; } = [];
}

public sealed class SettingsTabContribution
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Scope { get; set; } = "user"; // "user" | "admin"
    public TileElementSpec Element { get; set; } = new();
}

public sealed class TileTypeContribution
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = "view-dashboard";
    public TileElementSpec Element { get; set; } = new();
    public TileElementSpec? SettingsElement { get; set; }
    public TileSizeSpec DefaultSize { get; set; } = new() { W = 4, H = 2 };
    public TileSizeSpec MinSize { get; set; } = new() { W = 1, H = 1 };
    public TileSizeSpec MaxSize { get; set; } = new() { W = 16, H = 12 };
    public List<SettingsFieldSchema> SettingsSchema { get; set; } = [];
}

public sealed class TileElementSpec
{
    public string TagName { get; set; } = string.Empty;
    public string Script { get; set; } = string.Empty;
}

public sealed class TileSizeSpec
{
    public int W { get; set; } = 2;
    public int H { get; set; } = 2;
}

public sealed class ServerContribution
{
    public string Assembly { get; set; } = string.Empty;
    public string EntryType { get; set; } = string.Empty;
}

public sealed class ThemeContribution
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string CssFile { get; set; } = string.Empty;
    public string? PreferredIconPack { get; set; }
}

public sealed class IconPackContribution
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? ManifestFile { get; set; }
}

public sealed class IconPackManifestFile
{
    public List<IconPackItemSpec> Icons { get; set; } = [];
}

public sealed class IconPackItemSpec
{
    public string Name { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string File { get; set; } = string.Empty;
    public bool Color { get; set; } = true;
}

public sealed class SelectOptionSpec
{
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}

public sealed class SettingsFieldSchema
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    /// <summary>text | multiline | number | toggle | select | colour | icon | url | duration | secret | group</summary>
    public string Type { get; set; } = "text";
    public string? HelpText { get; set; }
    public JsonElement? DefaultValue { get; set; }
    public bool Required { get; set; }
    public double? Min { get; set; }
    public double? Max { get; set; }
    public string? Pattern { get; set; }
    public List<SelectOptionSpec>? Options { get; set; }
    public string? DynamicOptionsEndpoint { get; set; }
    /// <summary>Sub-fields when Type == "group" (repeating group of objects)</summary>
    public List<SettingsFieldSchema>? Fields { get; set; }
}

public static class SemVerHelper
{
    public static bool TryParse(string? version, out Version parsed)
    {
        parsed = new Version(0, 0, 0);
        if (string.IsNullOrWhiteSpace(version)) return false;
        var core = version.Split(['-', '+'], 2)[0];
        var parts = core.Split('.');
        if (parts.Length < 2 || parts.Length > 3) return false;
        if (!int.TryParse(parts[0], out var maj) || !int.TryParse(parts[1], out var min)) return false;
        var pat = 0;
        if (parts.Length == 3 && !int.TryParse(parts[2], out pat)) return false;
        if (maj < 0 || min < 0 || pat < 0) return false;
        parsed = new Version(maj, min, pat);
        return true;
    }
}
