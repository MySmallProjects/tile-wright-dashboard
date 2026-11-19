using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Tilewright.Server.Auth;
using Tilewright.Server.Models;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static class AuthEndpoints
{
    public sealed record SetupRequest(string DisplayName, string? Password);
    public sealed record LoginRequest(string UserId, string? Password);
    public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapGet("/status", async (
            HttpContext http,
            IUserStore users,
            ISiteStore siteStore,
            CancellationToken ct) =>
        {
            var hasUsers = await users.HasAnyUsersAsync(ct);
            var site = await siteStore.GetAsync(ct);
            PublicUserDto? currentUser = null;

            if (http.User.Identity?.IsAuthenticated == true)
            {
                var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!string.IsNullOrEmpty(userId))
                {
                    var record = await users.GetByIdAsync(userId, ct);
                    if (record is not null)
                    {
                        currentUser = ToPublicDto(record);
                    }
                }
            }

            return Results.Ok(new
            {
                needsSetup = !hasUsers,
                authenticated = currentUser is not null,
                user = currentUser,
                isHttps = http.Request.IsHttps,
                autoLoginEnabled = site.AutoLoginEnabled,
                defaultTheme = site.DefaultTheme,
                defaultBackground = site.DefaultBackground
            });
        }).AllowAnonymous();

        group.MapGet("/users", async (IUserStore users, CancellationToken ct) =>
        {
            var all = await users.GetAllAsync(ct);
            return Results.Ok(all.Select(ToPublicDto).ToList());
        }).AllowAnonymous();

        group.MapPost("/setup", async (
            SetupRequest req,
            HttpContext http,
            IUserStore users,
            ISessionStore sessions,
            IDashboardStore dashboards,
            ISiteStore siteStore,
            PasswordHasher<UserRecord> hasher,
            CancellationToken ct) =>
        {
            if (await users.HasAnyUsersAsync(ct))
            {
                return Results.Conflict(new { error = "Initial setup has already been completed." });
            }

            if (string.IsNullOrWhiteSpace(req.DisplayName))
            {
                return Results.BadRequest(new { error = "Display name is required." });
            }

            var admin = new UserRecord
            {
                Id = SafeId.NewId(),
                DisplayName = req.DisplayName.Trim(),
                Role = UserRoles.Admin,
                CreatedAt = DateTimeOffset.UtcNow
            };

            if (!string.IsNullOrEmpty(req.Password))
            {
                admin.PasswordHash = hasher.HashPassword(admin, req.Password);
            }

            await users.CreateAsync(admin, ct);
            await dashboards.CreateAsync(admin.Id, "Home", "home", ct);

            var createdSession = await sessions.CreateAsync(admin.Id, ct);
            var site = await siteStore.GetAsync(ct);
            SessionCookieHelper.AppendSessionCookie(http, site, createdSession.RawToken);

            return Results.Created($"/api/users/{admin.Id}", ToPublicDto(admin));
        }).AllowAnonymous();

        group.MapPost("/login", async (
            LoginRequest req,
            HttpContext http,
            IUserStore users,
            ISessionStore sessions,
            ISiteStore siteStore,
            PasswordHasher<UserRecord> hasher,
            LoginThrottleService throttle,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.UserId))
            {
                return Results.BadRequest(new { error = "UserId is required." });
            }

            var remoteIp = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var throttleKey = $"{remoteIp}:{req.UserId}";

            if (throttle.IsBlocked(throttleKey, out var retryAfter))
            {
                http.Response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString();
                return Results.StatusCode(StatusCodes.Status429TooManyRequests);
            }

            var user = await users.GetByIdAsync(req.UserId, ct);
            if (user is null)
            {
                throttle.RecordFailure(throttleKey);
                return Results.Unauthorized();
            }

            if (!string.IsNullOrEmpty(user.PasswordHash))
            {
                if (string.IsNullOrEmpty(req.Password))
                {
                    throttle.RecordFailure(throttleKey);
                    return Results.Unauthorized();
                }

                var verify = hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
                if (verify == PasswordVerificationResult.Failed)
                {
                    throttle.RecordFailure(throttleKey);
                    return Results.Unauthorized();
                }

                if (verify == PasswordVerificationResult.SuccessRehashNeeded)
                {
                    await users.UpdateAsync(user.Id, u =>
                    {
                        u.PasswordHash = hasher.HashPassword(u, req.Password);
                    }, ct);
                }
            }

            throttle.Reset(throttleKey);

            var createdSession = await sessions.CreateAsync(user.Id, ct);
            var site = await siteStore.GetAsync(ct);
            SessionCookieHelper.AppendSessionCookie(http, site, createdSession.RawToken);

            return Results.Ok(ToPublicDto(user));
        }).AllowAnonymous();

        group.MapPost("/logout", async (
            HttpContext http,
            ISessionStore sessions,
            ISiteStore siteStore,
            CancellationToken ct) =>
        {
            var rawToken = SessionCookieHelper.ReadToken(http.Request);
            if (!string.IsNullOrWhiteSpace(rawToken))
            {
                await sessions.DeleteByTokenAsync(rawToken, ct);
            }

            var site = await siteStore.GetAsync(ct);
            SessionCookieHelper.ClearSessionCookies(http, site);
            return Results.NoContent();
        }).AllowAnonymous();

        group.MapPut("/password", async (
            ChangePasswordRequest req,
            HttpContext http,
            IUserStore users,
            ISessionStore sessions,
            ISiteStore siteStore,
            PasswordHasher<UserRecord> hasher,
            CancellationToken ct) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var user = await users.GetByIdAsync(userId, ct);
            if (user is null) return Results.Unauthorized();

            if (!string.IsNullOrEmpty(user.PasswordHash))
            {
                if (string.IsNullOrEmpty(req.CurrentPassword) ||
                    hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword) == PasswordVerificationResult.Failed)
                {
                    return Results.BadRequest(new { error = "Current password is incorrect." });
                }
            }

            await users.UpdateAsync(userId, u =>
            {
                u.PasswordHash = string.IsNullOrEmpty(req.NewPassword)
                    ? null
                    : hasher.HashPassword(u, req.NewPassword);
            }, ct);

            // Revoke all existing sessions for this user and issue a fresh session for the caller
            await sessions.RevokeAllForUserAsync(userId, ct);
            var fresh = await sessions.CreateAsync(userId, ct);
            var site = await siteStore.GetAsync(ct);
            SessionCookieHelper.AppendSessionCookie(http, site, fresh.RawToken);

            return Results.NoContent();
        }).RequireAuthorization();

        return app;
    }

    public static PublicUserDto ToPublicDto(UserRecord u) =>
        new(u.Id, u.DisplayName, u.Role, !string.IsNullOrEmpty(u.PasswordHash), u.CreatedAt);
}
