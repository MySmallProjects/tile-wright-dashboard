using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public sealed class JsonSiteStore(JsonFileStore files, StoragePaths paths) : ISiteStore
{
    public Task<SiteSettings> GetAsync(CancellationToken ct = default) =>
        files.ReadAsync(paths.SiteFile, () => new SiteSettings(), ct);

    public async Task<SiteSettings> SaveAsync(SiteSettings settings, CancellationToken ct = default)
    {
        await files.WriteAsync(paths.SiteFile, settings, ct);
        return settings;
    }
}
