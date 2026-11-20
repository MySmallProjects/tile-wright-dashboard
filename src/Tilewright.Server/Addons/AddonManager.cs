using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Tilewright.AddonContracts;
using Tilewright.Server.Hubs;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Addons;

public sealed record AddonTileDto(
    string AddonId,
    string AddonName,
    string AddonVersion,
    string TileTypeId,
    TileTypeContribution Spec);

public sealed record AddonInfoDto(
    string Id,
    string Name,
    string Version,
    string Description,
    string Author,
    bool BuiltIn,
    string State,
    string? Error,
    bool ForcedDisabled,
    AddonContributions Contributes);

public sealed record AddonOverviewDto(
    bool RestartRequired,
    List<AddonInfoDto> Addons,
    List<AddonTileDto> AvailableTiles);

public sealed class LoadedAddon
{
    public required AddonManifest Manifest { get; init; }
    public required string DirectoryPath { get; init; }
    public required bool BuiltIn { get; init; }
    public required string State { get; set; }
    public string? Error { get; set; }
    public bool ForcedDisabled { get; init; }
    public IAddonModule? ServerModule { get; set; }
    public IAddonHostContext? HostContext { get; set; }
}

public sealed class AddonManager(
    StoragePaths paths,
    JsonFileStore files,
    ISecretStore secrets,
    AddonStateStore stateStore,
    IHttpClientFactory httpClientFactory,
    IHubContext<DashboardHub> hubContext,
    ILoggerFactory loggerFactory,
    ILogger<AddonManager> logger) : IHostedService
{
    private readonly ConcurrentDictionary<string, LoadedAddon> _addons = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<IDataProvider> _activeProviders = [];
    private volatile bool _restartRequired;

    public bool RestartRequired => _restartRequired;

    private string PendingInstallRoot => Path.Combine(paths.AddonsPendingDir, "install");
    private string PendingRemoveRoot => Path.Combine(paths.AddonsPendingDir, "remove");
    private string StagingRoot => Path.Combine(paths.AddonsPendingDir, "_staging");

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(PendingInstallRoot);
        Directory.CreateDirectory(PendingRemoveRoot);
        Directory.CreateDirectory(StagingRoot);

        ApplyPendingChanges();
        await DiscoverAndLoadAllAsync(cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var provider in _activeProviders)
        {
            try
            {
                await provider.StopAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Error stopping data provider {Source}", provider.SourceName);
            }
        }
        _activeProviders.Clear();
    }

    private void ApplyPendingChanges()
    {
        // 1. Apply pending removals
        if (Directory.Exists(PendingRemoveRoot))
        {
            foreach (var marker in Directory.GetFiles(PendingRemoveRoot))
            {
                var addonId = Path.GetFileName(marker);
                if (AddonIdValidator.IsValid(addonId))
                {
                    var installedDir = Path.Combine(paths.AddonsInstalledDir, addonId);
                    if (Directory.Exists(installedDir))
                    {
                        try
                        {
                            Directory.Delete(installedDir, recursive: true);
                            logger.LogInformation("Removed addon {AddonId} during startup.", addonId);
                        }
                        catch (Exception ex)
                        {
                            logger.LogError(ex, "Failed to remove addon {AddonId} during startup.", addonId);
                        }
                    }
                }
                try { File.Delete(marker); } catch { /* ignore */ }
            }
        }

        // 2. Apply pending installs / upgrades
        if (Directory.Exists(PendingInstallRoot))
        {
            foreach (var stagedDir in Directory.GetDirectories(PendingInstallRoot))
            {
                var addonId = Path.GetFileName(stagedDir);
                if (!AddonIdValidator.IsValid(addonId))
                {
                    try { Directory.Delete(stagedDir, recursive: true); } catch { /* ignore */ }
                    continue;
                }

                var targetDir = Path.Combine(paths.AddonsInstalledDir, addonId);
                try
                {
                    if (Directory.Exists(targetDir))
                    {
                        Directory.Delete(targetDir, recursive: true);
                    }
                    Directory.Move(stagedDir, targetDir);
                    logger.LogInformation("Installed/upgraded addon {AddonId} during startup.", addonId);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Failed to apply pending install for addon {AddonId}.", addonId);
                }
            }
        }
    }

    private async Task DiscoverAndLoadAllAsync(CancellationToken ct)
    {
        var savedStates = await stateStore.GetAllStatesAsync(ct);
        var forcedDisabled = stateStore.GetForcedDisabledAddons();

        // Built-in addons directory (copied to output/addons by build)
        var builtInDir = Path.Combine(AppContext.BaseDirectory, "addons");
        if (Directory.Exists(builtInDir))
        {
            await LoadDirectoryAsync(builtInDir, builtIn: true, savedStates, forcedDisabled, ct);
        }

        // Installed user addons
        if (Directory.Exists(paths.AddonsInstalledDir))
        {
            await LoadDirectoryAsync(paths.AddonsInstalledDir, builtIn: false, savedStates, forcedDisabled, ct);
        }
    }

    private async Task LoadDirectoryAsync(
        string parentDir,
        bool builtIn,
        Dictionary<string, bool> savedStates,
        HashSet<string> forcedDisabled,
        CancellationToken ct)
    {
        foreach (var dir in Directory.GetDirectories(parentDir))
        {
            var manifestPath = Path.Combine(dir, "addon.json");
            if (!File.Exists(manifestPath)) continue;

            AddonManifest? manifest;
            try
            {
                var json = await File.ReadAllTextAsync(manifestPath, ct);
                manifest = JsonSerializer.Deserialize<AddonManifest>(json, JsonFileStore.SerializerOptions);
            }
            catch (Exception ex)
            {
                var fallbackId = Path.GetFileName(dir);
                logger.LogError(ex, "Failed to parse addon.json for {AddonId}", fallbackId);
                _addons[fallbackId] = new LoadedAddon
                {
                    Manifest = new AddonManifest { Id = fallbackId, Name = fallbackId, Version = "0.0.0" },
                    DirectoryPath = dir,
                    BuiltIn = builtIn,
                    State = AddonStates.Failed,
                    Error = $"Invalid addon.json: {ex.Message}"
                };
                continue;
            }

            if (manifest is null) continue;

            var validationErr = AddonPackageValidator.ValidateManifestFields(manifest, dir);
            if (validationErr is not null)
            {
                logger.LogError("Addon {AddonId} manifest validation failed: {Error}", manifest.Id, validationErr);
                _addons[manifest.Id] = new LoadedAddon
                {
                    Manifest = manifest,
                    DirectoryPath = dir,
                    BuiltIn = builtIn,
                    State = AddonStates.Failed,
                    Error = validationErr
                };
                continue;
            }

            var isForcedOff = forcedDisabled.Contains(manifest.Id);
            var isEnabledInState = !savedStates.TryGetValue(manifest.Id, out var enabledFlag) || enabledFlag;
            var shouldEnable = !isForcedOff && isEnabledInState;

            var entry = new LoadedAddon
            {
                Manifest = manifest,
                DirectoryPath = dir,
                BuiltIn = builtIn,
                State = shouldEnable ? AddonStates.Enabled : AddonStates.Disabled,
                ForcedDisabled = isForcedOff
            };

            if (!shouldEnable)
            {
                logger.LogInformation(
                    "Addon {AddonId} v{Version} is disabled (forced={Forced}); skipping load.",
                    manifest.Id, manifest.Version, isForcedOff);
                _addons[manifest.Id] = entry;
                continue;
            }

            // Load optional server component in-process with full resilience
            if (manifest.Contributes.Server is not null)
            {
                try
                {
                    await LoadServerComponentAsync(entry, ct);
                }
                catch (Exception ex)
                {
                    entry.State = AddonStates.Failed;
                    entry.Error = ex.Message;
                    logger.LogError(ex, "Addon {AddonId} server component failed to load; skipping.", manifest.Id);
                }
            }

            _addons[manifest.Id] = entry;
        }
    }

    private async Task LoadServerComponentAsync(LoadedAddon entry, CancellationToken ct)
    {
        var serverSpec = entry.Manifest.Contributes.Server!;
        var asmPath = Path.GetFullPath(Path.Combine(entry.DirectoryPath, serverSpec.Assembly));
        var assembly = Assembly.LoadFrom(asmPath);
        var entryType = assembly.GetType(serverSpec.EntryType, throwOnError: false);

        if (entryType is null || !typeof(IAddonModule).IsAssignableFrom(entryType))
        {
            throw new InvalidOperationException(
                $"Entry type '{serverSpec.EntryType}' was not found or does not implement IAddonModule.");
        }

        if (Activator.CreateInstance(entryType) is not IAddonModule module)
        {
            throw new InvalidOperationException($"Could not instantiate '{serverSpec.EntryType}'.");
        }

        var addonDataDir = Path.Combine(paths.AddonsDataDir, entry.Manifest.Id);
        Directory.CreateDirectory(addonDataDir);

        var hostContext = new AddonHostContext(
            entry.Manifest.Id,
            addonDataDir,
            new HttpFactoryAdapter(httpClientFactory),
            secrets.ForAddon(entry.Manifest.Id),
            new AddonSettingsReaderAdapter(this, entry.Manifest.Id),
            new SignalRPushAdapter(hubContext),
            loggerFactory.CreateLogger($"Tilewright.Addon.{entry.Manifest.Id}"));

        await module.InitializeAsync(hostContext, ct);

        foreach (var provider in module.DataProviders)
        {
            await provider.StartAsync(hostContext, ct);
            _activeProviders.Add(provider);
        }

        entry.ServerModule = module;
        entry.HostContext = hostContext;
        logger.LogInformation("Loaded server component for addon {AddonId} v{Version}.", entry.Manifest.Id, entry.Manifest.Version);
    }

    public AddonOverviewDto GetOverview()
    {
        var list = new List<AddonInfoDto>();
        var tiles = new List<AddonTileDto>();

        var pendingInstalls = Directory.Exists(PendingInstallRoot)
            ? Directory.GetDirectories(PendingInstallRoot).Select(Path.GetFileName).Where(x => x is not null).ToHashSet(StringComparer.OrdinalIgnoreCase)!
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var pendingRemovals = Directory.Exists(PendingRemoveRoot)
            ? Directory.GetFiles(PendingRemoveRoot).Select(Path.GetFileName).Where(x => x is not null).ToHashSet(StringComparer.OrdinalIgnoreCase)!
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var a in _addons.Values.OrderBy(x => x.BuiltIn ? 0 : 1).ThenBy(x => x.Manifest.Name))
        {
            var effectiveState = pendingRemovals.Contains(a.Manifest.Id)
                ? AddonStates.PendingRemoval
                : pendingInstalls.Contains(a.Manifest.Id)
                    ? AddonStates.PendingInstall
                    : a.State;

            list.Add(new AddonInfoDto(
                a.Manifest.Id,
                a.Manifest.Name,
                a.Manifest.Version,
                a.Manifest.Description,
                a.Manifest.Author,
                a.BuiltIn,
                effectiveState,
                a.Error,
                a.ForcedDisabled,
                a.Manifest.Contributes));

            if (a.State == AddonStates.Enabled && !pendingRemovals.Contains(a.Manifest.Id))
            {
                foreach (var t in a.Manifest.Contributes.Tiles)
                {
                    tiles.Add(new AddonTileDto(
                        a.Manifest.Id,
                        a.Manifest.Name,
                        a.Manifest.Version,
                        $"{a.Manifest.Id}:{t.Id}",
                        t));
                }
            }
        }

        // Also include brand-new pending-install addons not yet in _addons
        foreach (var pendingId in pendingInstalls.Where(id => !_addons.ContainsKey(id)))
        {
            var mPath = Path.Combine(PendingInstallRoot, pendingId, "addon.json");
            AddonManifest? m = null;
            if (File.Exists(mPath))
            {
                try { m = JsonSerializer.Deserialize<AddonManifest>(File.ReadAllText(mPath), JsonFileStore.SerializerOptions); }
                catch { /* ignore */ }
            }
            list.Add(new AddonInfoDto(
                pendingId,
                m?.Name ?? pendingId,
                m?.Version ?? "0.0.0",
                m?.Description ?? "Pending installation on next restart.",
                m?.Author ?? "",
                BuiltIn: false,
                State: AddonStates.PendingInstall,
                Error: null,
                ForcedDisabled: false,
                Contributes: m?.Contributes ?? new AddonContributions()));
        }

        return new AddonOverviewDto(_restartRequired || pendingInstalls.Count > 0 || pendingRemovals.Count > 0, list, tiles);
    }

    public async Task<ZipValidationResult> StageInstallFromZipAsync(
        Stream zipStream,
        long contentLength,
        CancellationToken ct = default)
    {
        var stagingDir = Path.Combine(StagingRoot, Guid.NewGuid().ToString("N"));
        try
        {
            var installedMap = _addons.Values
                .ToDictionary(a => a.Manifest.Id, a => a.Manifest, StringComparer.OrdinalIgnoreCase);

            var result = await AddonPackageValidator.ValidateAndExtractAsync(
                zipStream,
                contentLength,
                stagingDir,
                installedMap,
                ct);

            if (!result.Success || result.Manifest is null)
            {
                return result;
            }

            if (_addons.TryGetValue(result.Manifest.Id, out var existing) && existing.BuiltIn)
            {
                return new ZipValidationResult(false, $"Cannot overwrite built-in addon '{result.Manifest.Id}'.");
            }

            var pendingDir = Path.Combine(PendingInstallRoot, result.Manifest.Id);
            if (Directory.Exists(pendingDir))
            {
                Directory.Delete(pendingDir, recursive: true);
            }
            Directory.Move(stagingDir, pendingDir);
            _restartRequired = true;

            logger.LogInformation(
                "Staged addon {AddonId} v{Version} (upgrade={IsUpgrade}) for next restart.",
                result.Manifest.Id, result.Manifest.Version, result.IsUpgrade);

            return result;
        }
        finally
        {
            if (Directory.Exists(stagingDir))
            {
                try { Directory.Delete(stagingDir, recursive: true); } catch { /* ignore */ }
            }
        }
    }

    public async Task<bool> SetEnabledAsync(string addonId, bool enabled, CancellationToken ct = default)
    {
        if (!_addons.ContainsKey(addonId)) return false;
        await stateStore.SetEnabledAsync(addonId, enabled, ct);
        _restartRequired = true;
        return true;
    }

    public Task<(bool Ok, string? Error)> MarkForRemovalAsync(string addonId)
    {
        if (!_addons.TryGetValue(addonId, out var entry))
        {
            return Task.FromResult<(bool, string?)>((false, "Addon not found."));
        }
        if (entry.BuiltIn)
        {
            return Task.FromResult<(bool, string?)>((false, "Built-in addons cannot be removed (you may disable them instead)."));
        }

        Directory.CreateDirectory(PendingRemoveRoot);
        var marker = Path.Combine(PendingRemoveRoot, addonId);
        File.WriteAllText(marker, DateTimeOffset.UtcNow.ToString("O"));
        _restartRequired = true;
        return Task.FromResult<(bool, string?)>((true, null));
    }

    public string? ResolveAssetPath(string addonId, string relativePath)
    {
        if (!AddonIdValidator.IsValid(addonId)) return null;
        if (!_addons.TryGetValue(addonId, out var entry)) return null;
        if (entry.State != AddonStates.Enabled) return null;

        if (string.IsNullOrWhiteSpace(relativePath) ||
            Path.IsPathRooted(relativePath) ||
            relativePath.Contains("..", StringComparison.Ordinal))
        {
            return null;
        }

        var rootFull = Path.GetFullPath(entry.DirectoryPath);
        var prefix = rootFull.EndsWith(Path.DirectorySeparatorChar) ? rootFull : rootFull + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(rootFull, relativePath));
        if (!full.StartsWith(prefix, StringComparison.Ordinal) || !File.Exists(full))
        {
            return null;
        }
        return full;
    }

    public async Task<Dictionary<string, JsonElement>> GetAddonSettingsRawAsync(string addonId, CancellationToken ct = default)
    {
        SafeId.Validate(addonId, nameof(addonId));
        var path = Path.Combine(paths.AddonsDataDir, addonId, "settings.json");
        return await files.ReadAsync(path, () => new Dictionary<string, JsonElement>(StringComparer.Ordinal), ct);
    }

    public async Task<(Dictionary<string, JsonElement> Settings, IReadOnlyDictionary<string, bool> SecretsSet)?> GetAddonSettingsForAdminAsync(
        string addonId,
        CancellationToken ct = default)
    {
        if (!_addons.TryGetValue(addonId, out var entry)) return null;
        var settings = await GetAddonSettingsRawAsync(addonId, ct);
        var secretKeys = entry.Manifest.Contributes.AddonSettingsSchema
            .Where(f => string.Equals(f.Type, "secret", StringComparison.OrdinalIgnoreCase))
            .Select(f => f.Key)
            .ToHashSet(StringComparer.Ordinal);

        // Strip any secret keys just in case; secrets live only in SecretStore
        foreach (var k in secretKeys) settings.Remove(k);

        var status = await secrets.GetStatusAsync(addonId, ct);
        return (settings, status);
    }

    public async Task<bool> SaveAddonSettingsAsync(
        string addonId,
        Dictionary<string, JsonElement> incomingSettings,
        Dictionary<string, string?>? incomingSecrets,
        CancellationToken ct = default)
    {
        if (!_addons.TryGetValue(addonId, out var entry)) return false;

        var secretKeys = entry.Manifest.Contributes.AddonSettingsSchema
            .Where(f => string.Equals(f.Type, "secret", StringComparison.OrdinalIgnoreCase))
            .Select(f => f.Key)
            .ToHashSet(StringComparer.Ordinal);

        var clean = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var (k, v) in incomingSettings)
        {
            if (!secretKeys.Contains(k)) clean[k] = v;
        }

        var path = Path.Combine(paths.AddonsDataDir, addonId, "settings.json");
        await files.WriteAsync(path, clean, ct);

        if (incomingSecrets is not null)
        {
            foreach (var (k, v) in incomingSecrets)
            {
                if (secretKeys.Contains(k))
                {
                    await secrets.SetAsync(addonId, k, v, ct);
                }
            }
        }
        return true;
    }

    public async Task<IReadOnlyList<DynamicOption>> GetDynamicOptionsAsync(
        string addonId,
        string endpoint,
        CancellationToken ct = default)
    {
        if (!_addons.TryGetValue(addonId, out var entry) ||
            entry.State != AddonStates.Enabled ||
            entry.ServerModule?.DynamicOptionsProvider is null ||
            entry.HostContext is null)
        {
            return [];
        }

        return await entry.ServerModule.DynamicOptionsProvider.GetOptionsAsync(endpoint, entry.HostContext, ct);
    }

    public async Task<object?> InvokeActionAsync(
        string addonId,
        string action,
        JsonElement? payload,
        CancellationToken ct = default)
    {
        if (!_addons.TryGetValue(addonId, out var entry) ||
            entry.State != AddonStates.Enabled ||
            entry.ServerModule?.ActionHandler is null ||
            entry.HostContext is null)
        {
            return null;
        }

        return await entry.ServerModule.ActionHandler.HandleActionAsync(action, payload, entry.HostContext, ct);
    }

    private sealed class AddonHostContext(
        string addonId,
        string dataFolder,
        IAddonHttpClientFactory http,
        IAddonSecretStore secretStore,
        IAddonSettingsReader settingsReader,
        IAddonPushService push,
        ILogger addonLogger) : IAddonHostContext
    {
        public string AddonId { get; } = addonId;
        public string DataFolder { get; } = dataFolder;
        public IAddonHttpClientFactory Http { get; } = http;
        public IAddonSecretStore Secrets { get; } = secretStore;
        public IAddonSettingsReader Settings { get; } = settingsReader;
        public IAddonPushService Push { get; } = push;
        public ILogger Logger { get; } = addonLogger;
    }

    private sealed class HttpFactoryAdapter(IHttpClientFactory inner) : IAddonHttpClientFactory
    {
        public HttpClient CreateClient(string? name = null) =>
            string.IsNullOrWhiteSpace(name) ? inner.CreateClient() : inner.CreateClient(name);
    }

    private sealed class AddonSettingsReaderAdapter(AddonManager manager, string addonId) : IAddonSettingsReader
    {
        public async Task<IReadOnlyDictionary<string, JsonElement>> GetAddonSettingsAsync(CancellationToken ct = default) =>
            await manager.GetAddonSettingsRawAsync(addonId, ct);
    }

    private sealed class SignalRPushAdapter(IHubContext<DashboardHub> hub) : IAddonPushService
    {
        public Task PushToSourceAsync(string source, object payload, CancellationToken ct = default) =>
            hub.Clients.Group($"source:{source}").SendAsync("DataUpdate", new
            {
                source,
                payload,
                timestamp = DateTimeOffset.UtcNow
            }, ct);
    }
}
