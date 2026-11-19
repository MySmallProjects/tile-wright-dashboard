using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public interface ISiteStore
{
    Task<SiteSettings> GetAsync(CancellationToken ct = default);
    Task<SiteSettings> SaveAsync(SiteSettings settings, CancellationToken ct = default);
}
