using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Tilewright.AddonContracts;

public sealed record DynamicOption(string Value, string Label);

public sealed record AddonUserContext(string UserId, bool IsAdmin);

public sealed record DynamicIconItem(string Name, string Label, string AssetPath, bool Color = true);

public sealed record DynamicIconPack(string PackId, string PackName, IReadOnlyList<DynamicIconItem> Icons);

public interface IAddonSecretStore
{
    Task<string?> GetSecretAsync(string key, CancellationToken ct = default);
    Task SetSecretAsync(string key, string? value, CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, bool>> GetSecretStatusAsync(CancellationToken ct = default);
}

public interface IAddonSettingsReader
{
    Task<IReadOnlyDictionary<string, JsonElement>> GetAddonSettingsAsync(CancellationToken ct = default);
}

public interface IAddonPushService
{
    Task PushToSourceAsync(string source, object payload, CancellationToken ct = default);
}

public interface IAddonHttpClientFactory
{
    HttpClient CreateClient(string? name = null);
}

public interface IAddonHostContext
{
    string AddonId { get; }
    string DataFolder { get; }
    IAddonHttpClientFactory Http { get; }
    IAddonSecretStore Secrets { get; }
    IAddonSettingsReader Settings { get; }
    IAddonPushService Push { get; }
    ILogger Logger { get; }
    AddonUserContext? CurrentUser => null;
}

public interface IDataProvider
{
    string SourceName { get; }
    Task<object?> GetCurrentAsync(CancellationToken ct = default);
    Task StartAsync(IAddonHostContext host, CancellationToken ct = default);
    Task StopAsync(CancellationToken ct = default);
}

public interface IActionHandler
{
    Task<object?> HandleActionAsync(
        string action,
        JsonElement? payload,
        IAddonHostContext host,
        CancellationToken ct = default);
}

public interface IDynamicOptionsProvider
{
    Task<IReadOnlyList<DynamicOption>> GetOptionsAsync(
        string endpoint,
        IAddonHostContext host,
        CancellationToken ct = default);
}

public interface IDynamicIconPackProvider
{
    Task<IReadOnlyList<DynamicIconPack>> GetIconPacksAsync(
        AddonUserContext? user,
        IAddonHostContext host,
        CancellationToken ct = default);

    string? ResolveAssetPath(
        string assetPath,
        AddonUserContext? user,
        IAddonHostContext host) => null;
}

public interface IAddonModule
{
    Task InitializeAsync(IAddonHostContext host, CancellationToken ct = default);
    IReadOnlyList<IDataProvider> DataProviders => [];
    IActionHandler? ActionHandler => null;
    IDynamicOptionsProvider? DynamicOptionsProvider => null;
    IDynamicIconPackProvider? DynamicIconPackProvider => null;
}
