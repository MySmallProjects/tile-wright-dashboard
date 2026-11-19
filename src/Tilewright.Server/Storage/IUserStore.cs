using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public interface IUserStore
{
    Task<IReadOnlyList<UserRecord>> GetAllAsync(CancellationToken ct = default);
    Task<UserRecord?> GetByIdAsync(string userId, CancellationToken ct = default);
    Task<bool> HasAnyUsersAsync(CancellationToken ct = default);
    Task<UserRecord> CreateAsync(UserRecord user, CancellationToken ct = default);
    Task<UserRecord?> UpdateAsync(string userId, Action<UserRecord> mutate, CancellationToken ct = default);
    Task<bool> DeleteAsync(string userId, CancellationToken ct = default);
    Task<UserSettings> GetSettingsAsync(string userId, CancellationToken ct = default);
    Task<UserSettings> SaveSettingsAsync(string userId, UserSettings settings, CancellationToken ct = default);
}
