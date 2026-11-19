using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public sealed class JsonUserStore(JsonFileStore files, StoragePaths paths) : IUserStore
{
    public async Task<IReadOnlyList<UserRecord>> GetAllAsync(CancellationToken ct = default)
    {
        var data = await files.ReadAsync(paths.UsersFile, () => new UsersFile(), ct);
        return data.Users;
    }

    public async Task<UserRecord?> GetByIdAsync(string userId, CancellationToken ct = default)
    {
        var users = await GetAllAsync(ct);
        return users.FirstOrDefault(u => string.Equals(u.Id, userId, StringComparison.Ordinal));
    }

    public async Task<bool> HasAnyUsersAsync(CancellationToken ct = default)
    {
        var users = await GetAllAsync(ct);
        return users.Count > 0;
    }

    public async Task<UserRecord> CreateAsync(UserRecord user, CancellationToken ct = default)
    {
        SafeId.Validate(user.Id, nameof(user.Id));
        await files.UpdateAsync(paths.UsersFile, () => new UsersFile(), file =>
        {
            if (file.Users.Any(u => string.Equals(u.Id, user.Id, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException($"User '{user.Id}' already exists.");
            }
            file.Users.Add(user);
        }, ct);
        Directory.CreateDirectory(paths.UserDir(user.Id));
        Directory.CreateDirectory(paths.UserBackgroundsDir(user.Id));
        return user;
    }

    public Task<UserRecord?> UpdateAsync(string userId, Action<UserRecord> mutate, CancellationToken ct = default)
    {
        return files.UpdateAsync(paths.UsersFile, () => new UsersFile(), file =>
        {
            var user = file.Users.FirstOrDefault(u => string.Equals(u.Id, userId, StringComparison.Ordinal));
            if (user is null) return null;
            mutate(user);
            return user;
        }, ct);
    }

    public Task<bool> DeleteAsync(string userId, CancellationToken ct = default)
    {
        return files.UpdateAsync(paths.UsersFile, () => new UsersFile(), file =>
        {
            var removed = file.Users.RemoveAll(u => string.Equals(u.Id, userId, StringComparison.Ordinal));
            return removed > 0;
        }, ct);
    }

    public Task<UserSettings> GetSettingsAsync(string userId, CancellationToken ct = default) =>
        files.ReadAsync(paths.UserSettingsFile(userId), () => new UserSettings(), ct);

    public async Task<UserSettings> SaveSettingsAsync(string userId, UserSettings settings, CancellationToken ct = default)
    {
        await files.WriteAsync(paths.UserSettingsFile(userId), settings, ct);
        return settings;
    }
}
