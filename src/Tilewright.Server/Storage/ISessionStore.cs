using Tilewright.Server.Models;

namespace Tilewright.Server.Storage;

public sealed record CreatedSession(SessionRecord Record, string RawToken);

public interface ISessionStore
{
    Task<CreatedSession> CreateAsync(string userId, CancellationToken ct = default);
    Task<SessionRecord?> ValidateAsync(string rawToken, CancellationToken ct = default);
    Task DeleteByTokenAsync(string rawToken, CancellationToken ct = default);
    Task RevokeAllForUserAsync(string userId, CancellationToken ct = default);
}
