using System.Security.Cryptography;
using System.Text;
using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public sealed class JsonSessionStore(JsonFileStore files, StoragePaths paths) : ISessionStore
{
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(365);
    private static readonly TimeSpan LastSeenWriteThreshold = TimeSpan.FromMinutes(5);

    public async Task<CreatedSession> CreateAsync(string userId, CancellationToken ct = default)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var rawToken = Convert.ToBase64String(tokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        var now = DateTimeOffset.UtcNow;
        var record = new SessionRecord
        {
            Id = SafeId.NewId(),
            TokenHash = HashToken(rawToken),
            UserId = userId,
            CreatedAt = now,
            ExpiresAt = now.Add(SessionLifetime),
            LastSeenAt = now
        };

        await files.UpdateAsync(paths.SessionsFile, () => new SessionsFile(), file =>
        {
            file.Sessions.RemoveAll(s => s.ExpiresAt <= now);
            file.Sessions.Add(record);
        }, ct);

        return new CreatedSession(record, rawToken);
    }

    public async Task<SessionRecord?> ValidateAsync(string rawToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(rawToken)) return null;

        var hash = HashToken(rawToken);
        var now = DateTimeOffset.UtcNow;
        var data = await files.ReadAsync(paths.SessionsFile, () => new SessionsFile(), ct);

        var session = data.Sessions.FirstOrDefault(s =>
            CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(s.TokenHash),
                Encoding.UTF8.GetBytes(hash)));

        if (session is null || session.ExpiresAt <= now)
        {
            return null;
        }

        if (now - session.LastSeenAt >= LastSeenWriteThreshold)
        {
            await files.UpdateAsync(paths.SessionsFile, () => new SessionsFile(), file =>
            {
                var target = file.Sessions.FirstOrDefault(s => s.Id == session.Id);
                if (target is not null)
                {
                    target.LastSeenAt = now;
                }
            }, ct);
            session.LastSeenAt = now;
        }

        return session;
    }

    public Task DeleteByTokenAsync(string rawToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(rawToken)) return Task.CompletedTask;
        var hash = HashToken(rawToken);

        return files.UpdateAsync(paths.SessionsFile, () => new SessionsFile(), file =>
        {
            file.Sessions.RemoveAll(s => string.Equals(s.TokenHash, hash, StringComparison.Ordinal));
        }, ct);
    }

    public Task RevokeAllForUserAsync(string userId, CancellationToken ct = default)
    {
        return files.UpdateAsync(paths.SessionsFile, () => new SessionsFile(), file =>
        {
            file.Sessions.RemoveAll(s => string.Equals(s.UserId, userId, StringComparison.Ordinal));
        }, ct);
    }

    public static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
