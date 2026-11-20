using Tilewright.AddonContracts;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Addons;

public sealed class SecretsFile
{
    public Dictionary<string, string> Values { get; set; } = new(StringComparer.Ordinal);
}

public interface ISecretStore
{
    Task<string?> GetAsync(string addonId, string key, CancellationToken ct = default);
    Task SetAsync(string addonId, string key, string? value, CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, bool>> GetStatusAsync(string addonId, CancellationToken ct = default);
    IAddonSecretStore ForAddon(string addonId);
}

public sealed class JsonSecretStore(JsonFileStore files, StoragePaths paths) : ISecretStore
{
    private string SecretFilePath(string addonId)
    {
        SafeId.Validate(addonId, nameof(addonId));
        return paths.EnsureContained(Path.Combine(paths.SecretsDir, $"{addonId}.json"));
    }

    public async Task<string?> GetAsync(string addonId, string key, CancellationToken ct = default)
    {
        var path = SecretFilePath(addonId);
        var data = await files.ReadAsync(path, () => new SecretsFile(), ct);
        return data.Values.TryGetValue(key, out var val) ? val : null;
    }

    public async Task SetAsync(string addonId, string key, string? value, CancellationToken ct = default)
    {
        var path = SecretFilePath(addonId);
        await files.UpdateAsync(path, () => new SecretsFile(), file =>
        {
            if (string.IsNullOrEmpty(value))
            {
                file.Values.Remove(key);
            }
            else
            {
                file.Values[key] = value;
            }
        }, ct);

        RestrictPermissions(path);
    }

    public async Task<IReadOnlyDictionary<string, bool>> GetStatusAsync(string addonId, CancellationToken ct = default)
    {
        var path = SecretFilePath(addonId);
        var data = await files.ReadAsync(path, () => new SecretsFile(), ct);
        return data.Values.ToDictionary(kv => kv.Key, kv => !string.IsNullOrEmpty(kv.Value), StringComparer.Ordinal);
    }

    public IAddonSecretStore ForAddon(string addonId) => new ScopedSecretStore(this, addonId);

    private static void RestrictPermissions(string path)
    {
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS()) return;
        try
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch
        {
            // Ignore on filesystems that do not support Unix mode bits
        }
    }

    private sealed class ScopedSecretStore(JsonSecretStore parent, string addonId) : IAddonSecretStore
    {
        public Task<string?> GetSecretAsync(string key, CancellationToken ct = default) =>
            parent.GetAsync(addonId, key, ct);

        public Task SetSecretAsync(string key, string? value, CancellationToken ct = default) =>
            parent.SetAsync(addonId, key, value, ct);

        public Task<IReadOnlyDictionary<string, bool>> GetSecretStatusAsync(CancellationToken ct = default) =>
            parent.GetStatusAsync(addonId, ct);
    }
}
