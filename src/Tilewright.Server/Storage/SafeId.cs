using System.Text.RegularExpressions;

namespace Tilewright.Server.Storage;

public static partial class SafeId
{
    [GeneratedRegex("^[a-zA-Z0-9_-]{1,64}$", RegexOptions.Compiled)]
    private static partial Regex Pattern();

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && Pattern().IsMatch(value);

    public static void Validate(string? value, string paramName)
    {
        if (!IsValid(value))
        {
            throw new ArgumentException(
                $"Invalid identifier '{paramName}'. Only letters, digits, '-' and '_' (1-64 chars) are allowed.",
                paramName);
        }
    }

    public static string NewId() => Guid.NewGuid().ToString("N")[..12];
}
