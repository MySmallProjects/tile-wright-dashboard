namespace Tilewright.Server.Models;

public static class UserRoles
{
    public const string Admin = "admin";
    public const string User = "user";
}

public sealed class UserRecord
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = UserRoles.User;
    public string? PasswordHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class UsersFile
{
    public List<UserRecord> Users { get; set; } = [];
}

public sealed record PublicUserDto(
    string Id,
    string DisplayName,
    string Role,
    bool HasPassword,
    DateTimeOffset CreatedAt);

public sealed class UserSettings
{
    /// <summary>light | dark | system | custom addon theme id</summary>
    public string Theme { get; set; } = "light";
    public BackgroundSettings? Background { get; set; }
    public int GridColumnWidth { get; set; } = 64;
    public int GridCellHeight { get; set; } = 64;
    public int GridGap { get; set; } = 10;
    public bool MoveSnapping { get; set; } = true;
    public bool ResizeSnapping { get; set; } = true;
    public bool AutoArrange { get; set; } = false;
    public int TileOpacity { get; set; } = 88;
    public bool TileBorder { get; set; } = true;
    public bool BackdropBlur { get; set; } = false;
    public bool DashboardInfiniteCycle { get; set; } = true;
}
