using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Tilewright.Server.Models;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static class UserEndpoints
{
    public sealed record CreateUserRequest(string DisplayName, string? Role, string? Password);
    public sealed record UpdateUserRequest(string DisplayName, string Role);
    public sealed record ResetPasswordRequest(string? NewPassword);

    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        // Admin-only user management
        var adminGroup = app.MapGroup("/api/users")
            .WithTags("Users (Admin)")
            .RequireAuthorization("AdminOnly");

        adminGroup.MapGet("/", async (IUserStore users, CancellationToken ct) =>
        {
            var all = await users.GetAllAsync(ct);
            return Results.Ok(all.Select(AuthEndpoints.ToPublicDto).ToList());
        });

        adminGroup.MapPost("/", async (
            CreateUserRequest req,
            IUserStore users,
            IDashboardStore dashboards,
            PasswordHasher<UserRecord> hasher,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.DisplayName))
            {
                return Results.BadRequest(new { error = "Display name is required." });
            }

            var role = string.Equals(req.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
                ? UserRoles.Admin
                : UserRoles.User;

            var record = new UserRecord
            {
                Id = SafeId.NewId(),
                DisplayName = req.DisplayName.Trim(),
                Role = role,
                CreatedAt = DateTimeOffset.UtcNow
            };

            if (!string.IsNullOrEmpty(req.Password))
            {
                record.PasswordHash = hasher.HashPassword(record, req.Password);
            }

            await users.CreateAsync(record, ct);
            await dashboards.CreateAsync(record.Id, "Home", "home", ct);

            return Results.Created($"/api/users/{record.Id}", AuthEndpoints.ToPublicDto(record));
        });

        adminGroup.MapPut("/{id}", async (
            string id,
            UpdateUserRequest req,
            IUserStore users,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid user id." });
            if (string.IsNullOrWhiteSpace(req.DisplayName))
            {
                return Results.BadRequest(new { error = "Display name is required." });
            }

            var nextRole = string.Equals(req.Role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase)
                ? UserRoles.Admin
                : UserRoles.User;

            // Ensure at least one admin remains
            var all = await users.GetAllAsync(ct);
            var existing = all.FirstOrDefault(u => u.Id == id);
            if (existing is null) return Results.NotFound();

            if (existing.Role == UserRoles.Admin &&
                nextRole != UserRoles.Admin &&
                all.Count(u => u.Role == UserRoles.Admin) <= 1)
            {
                return Results.BadRequest(new { error = "Cannot demote the last admin." });
            }

            var updated = await users.UpdateAsync(id, u =>
            {
                u.DisplayName = req.DisplayName.Trim();
                u.Role = nextRole;
            }, ct);

            return updated is null ? Results.NotFound() : Results.Ok(AuthEndpoints.ToPublicDto(updated));
        });

        adminGroup.MapPut("/{id}/password", async (
            string id,
            ResetPasswordRequest req,
            IUserStore users,
            ISessionStore sessions,
            PasswordHasher<UserRecord> hasher,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid user id." });

            var updated = await users.UpdateAsync(id, u =>
            {
                u.PasswordHash = string.IsNullOrEmpty(req.NewPassword)
                    ? null
                    : hasher.HashPassword(u, req.NewPassword);
            }, ct);

            if (updated is null) return Results.NotFound();

            await sessions.RevokeAllForUserAsync(id, ct);
            return Results.NoContent();
        });

        adminGroup.MapDelete("/{id}", async (
            string id,
            IUserStore users,
            ISessionStore sessions,
            CancellationToken ct) =>
        {
            if (!SafeId.IsValid(id)) return Results.BadRequest(new { error = "Invalid user id." });

            var all = await users.GetAllAsync(ct);
            var existing = all.FirstOrDefault(u => u.Id == id);
            if (existing is null) return Results.NotFound();

            if (existing.Role == UserRoles.Admin && all.Count(u => u.Role == UserRoles.Admin) <= 1)
            {
                return Results.BadRequest(new { error = "Cannot delete the last admin." });
            }

            await users.DeleteAsync(id, ct);
            await sessions.RevokeAllForUserAsync(id, ct);
            return Results.NoContent();
        });

        // Authenticated user's own settings
        var selfGroup = app.MapGroup("/api/user")
            .WithTags("User Settings")
            .RequireAuthorization();

        selfGroup.MapGet("/settings", async (HttpContext http, IUserStore users, CancellationToken ct) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
            var settings = await users.GetSettingsAsync(userId, ct);
            return Results.Ok(settings);
        });

        selfGroup.MapPut("/settings", async (
            UserSettings req,
            HttpContext http,
            IUserStore users,
            CancellationToken ct) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            req.GridColumnWidth = Math.Clamp(req.GridColumnWidth, 48, 320);
            req.GridCellHeight = Math.Clamp(req.GridCellHeight, 32, 240);
            req.GridGap = Math.Clamp(req.GridGap, 0, 32);
            req.TileOpacity = Math.Clamp(req.TileOpacity, 10, 100);

            var saved = await users.SaveSettingsAsync(userId, req, ct);
            return Results.Ok(saved);
        });

        return app;
    }
}
