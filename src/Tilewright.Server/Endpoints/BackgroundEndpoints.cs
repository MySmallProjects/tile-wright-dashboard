using System.Security.Claims;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Endpoints;

public static class BackgroundEndpoints
{
    private const long MaxUploadBytes = 15 * 1024 * 1024; // 15 MB
    private const int MaxDimension = 2560;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    public static IEndpointRouteBuilder MapBackgroundEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/backgrounds").WithTags("Backgrounds");

        // User background upload (resized to max 2560px and re-encoded as WebP)
        group.MapPost("/user", async (HttpRequest request, HttpContext http, StoragePaths paths, CancellationToken ct) =>
        {
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var (error, imageId) = await ProcessUploadAsync(
                request,
                id => paths.UserBackgroundFile(userId, id),
                paths.UserBackgroundsDir(userId),
                ct);

            return error ?? Results.Created($"/api/backgrounds/user/{imageId}", new { imageId });
        }).RequireAuthorization().DisableAntiforgery();

        group.MapGet("/user/{imageId}", (string imageId, HttpContext http, StoragePaths paths) =>
        {
            if (!SafeId.IsValid(imageId)) return Results.BadRequest(new { error = "Invalid image id." });
            var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var path = paths.UserBackgroundFile(userId, imageId);
            if (!File.Exists(path)) return Results.NotFound();

            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File(path, "image/webp");
        }).RequireAuthorization();

        // Site default background upload (admin-only, served publicly for login screen)
        group.MapPost("/site", async (HttpRequest request, StoragePaths paths, CancellationToken ct) =>
        {
            var (error, imageId) = await ProcessUploadAsync(
                request,
                id => paths.SiteBackgroundFile(id),
                paths.SiteBackgroundsDir,
                ct);

            return error ?? Results.Created($"/api/backgrounds/site/{imageId}", new { imageId });
        }).RequireAuthorization("AdminOnly").DisableAntiforgery();

        group.MapGet("/site/{imageId}", (string imageId, HttpContext http, StoragePaths paths) =>
        {
            if (!SafeId.IsValid(imageId)) return Results.BadRequest(new { error = "Invalid image id." });
            var path = paths.SiteBackgroundFile(imageId);
            if (!File.Exists(path)) return Results.NotFound();

            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File(path, "image/webp");
        }).AllowAnonymous();

        return app;
    }

    private static async Task<(IResult? Error, string? ImageId)> ProcessUploadAsync(
        HttpRequest request,
        Func<string, string> targetPathFactory,
        string targetDir,
        CancellationToken ct)
    {
        if (!request.HasFormContentType)
        {
            return (Results.BadRequest(new { error = "Multipart form upload expected." }), null);
        }

        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
        if (file is null || file.Length == 0)
        {
            return (Results.BadRequest(new { error = "No image file provided." }), null);
        }

        if (file.Length > MaxUploadBytes)
        {
            return (Results.BadRequest(new { error = "Image exceeds maximum upload size of 15 MB." }), null);
        }

        if (!AllowedContentTypes.Contains(file.ContentType))
        {
            return (Results.BadRequest(new { error = "Only JPEG, PNG, and WebP images are supported." }), null);
        }

        Directory.CreateDirectory(targetDir);
        var imageId = SafeId.NewId();
        var targetPath = targetPathFactory(imageId);
        var tempPath = $"{targetPath}.tmp.{Guid.NewGuid():N}";

        try
        {
            await using var stream = file.OpenReadStream();
            using var image = await Image.LoadAsync(stream, ct);

            image.Mutate(x =>
            {
                x.AutoOrient();
                if (image.Width > MaxDimension || image.Height > MaxDimension)
                {
                    x.Resize(new ResizeOptions
                    {
                        Mode = ResizeMode.Max,
                        Size = new Size(MaxDimension, MaxDimension)
                    });
                }
            });

            await image.SaveAsWebpAsync(tempPath, new WebpEncoder { Quality = 84 }, ct);
            File.Move(tempPath, targetPath, overwrite: true);
            return (null, imageId);
        }
        catch (UnknownImageFormatException)
        {
            return (Results.BadRequest(new { error = "Uploaded file is not a valid image." }), null);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch { /* ignore */ }
            }
        }
    }
}
