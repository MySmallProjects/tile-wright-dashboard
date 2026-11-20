using Tilewright.Server.Storage;

namespace Tilewright.Server.Addons;

public sealed class AddonStateFile
{
    /// <summary>Map of addonId -> enabled (true/false). Missing entries default to enabled.</summary>
    public Dictionary<string, bool> Enabled { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class AddonStateStore(JsonFileStore files, StoragePaths paths, IConfiguration configuration)
{
    private string StateFilePath => Path.Combine(paths.Root, "addons-state.json");
    private string RecoveryFilePath => Path.Combine(paths.Root, "disabled-addons.txt");

    public async Task<Dictionary<string, bool>> GetAllStatesAsync(CancellationToken ct = default)
    {
        var data = await files.ReadAsync(StateFilePath, () => new AddonStateFile(), ct);
        return new Dictionary<string, bool>(data.Enabled, StringComparer.OrdinalIgnoreCase);
    }

    public Task SetEnabledAsync(string addonId, bool enabled, CancellationToken ct = default)
    {
        return files.UpdateAsync(StateFilePath, () => new AddonStateFile(), file =>
        {
            file.Enabled[addonId] = enabled;
        }, ct);
    }

    /// <summary>
    /// Recovery override (§5.2a): forces addons off at startup via
    /// Tilewright__DisabledAddons=id1,id2 OR data/disabled-addons.txt.
    /// </summary>
    public HashSet<string> GetForcedDisabledAddons()
    {
        var forced = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var envVal = configuration["Tilewright:DisabledAddons"];
        if (!string.IsNullOrWhiteSpace(envVal))
        {
            foreach (var part in envVal.Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                forced.Add(part);
            }
        }

        if (File.Exists(RecoveryFilePath))
        {
            foreach (var rawLine in File.ReadAllLines(RecoveryFilePath))
            {
                var line = rawLine.Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
                forced.Add(line);
            }
        }

        return forced;
    }
}
