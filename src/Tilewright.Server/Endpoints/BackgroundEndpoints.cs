using System.Security.Claims;
using SkiaSharp;
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
            using var codec = SKCodec.Create(stream);
            if (codec is null)
            {
                return (Results.BadRequest(new { error = "Uploaded file is not a valid image." }), null);
            }

            using var decoded = SKBitmap.Decode(codec);
            if (decoded is null)
            {
                return (Results.BadRequest(new { error = "Uploaded file is not a valid image." }), null);
            }

            using var oriented = codec.EncodedOrigin == SKEncodedOrigin.TopLeft
                ? null
                : ApplyExifOrientation(decoded, codec.EncodedOrigin);
            var sourceBitmap = oriented ?? decoded;
            SKBitmap outputBitmap = sourceBitmap;
            SKBitmap? resized = null;
            try
            {
                if (sourceBitmap.Width > MaxDimension || sourceBitmap.Height > MaxDimension)
                {
                    var scale = Math.Min((double)MaxDimension / sourceBitmap.Width, (double)MaxDimension / sourceBitmap.Height);
                    var targetW = Math.Max(1, (int)Math.Round(sourceBitmap.Width * scale));
                    var targetH = Math.Max(1, (int)Math.Round(sourceBitmap.Height * scale));
                    var targetInfo = new SKImageInfo(targetW, targetH, sourceBitmap.ColorType, sourceBitmap.AlphaType);
                    resized = sourceBitmap.Resize(targetInfo, new SKSamplingOptions(SKCubicResampler.Mitchell));
                    if (resized is not null)
                    {
                        outputBitmap = resized;
                    }
                }

                using var skImage = SKImage.FromBitmap(outputBitmap);
                using var encoded = skImage.Encode(SKEncodedImageFormat.Webp, 84);
                if (encoded is null)
                {
                    return (Results.BadRequest(new { error = "Failed to encode uploaded image." }), null);
                }

                await using (var outStream = File.Create(tempPath))
                {
                    encoded.SaveTo(outStream);
                }
            }
            finally
            {
                resized?.Dispose();
            }

            File.Move(tempPath, targetPath, overwrite: true);
            return (null, imageId);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch { /* ignore */ }
            }
        }
    }

    private static SKBitmap ApplyExifOrientation(SKBitmap bitmap, SKEncodedOrigin origin)
    {
        var swapAxes = origin is SKEncodedOrigin.LeftTop
            or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom
            or SKEncodedOrigin.LeftBottom;

        var width = swapAxes ? bitmap.Height : bitmap.Width;
        var height = swapAxes ? bitmap.Width : bitmap.Height;
        var result = new SKBitmap(width, height, bitmap.ColorType, bitmap.AlphaType);

        using var canvas = new SKCanvas(result);
        switch (origin)
        {
            case SKEncodedOrigin.TopRight:
                canvas.Scale(-1, 1, width / 2f, height / 2f);
                break;
            case SKEncodedOrigin.BottomRight:
                canvas.RotateDegrees(180, width / 2f, height / 2f);
                break;
            case SKEncodedOrigin.BottomLeft:
                canvas.Scale(1, -1, width / 2f, height / 2f);
                break;
            case SKEncodedOrigin.LeftTop:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                canvas.Scale(1, -1, bitmap.Width / 2f, bitmap.Height / 2f);
                break;
            case SKEncodedOrigin.RightTop:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                break;
            case SKEncodedOrigin.RightBottom:
                canvas.Translate(0, height);
                canvas.RotateDegrees(270);
                canvas.Scale(1, -1, bitmap.Width / 2f, bitmap.Height / 2f);
                break;
            case SKEncodedOrigin.LeftBottom:
                canvas.Translate(0, height);
                canvas.RotateDegrees(270);
                break;
        }

        using var image = SKImage.FromBitmap(bitmap);
        canvas.DrawImage(image, 0, 0, SKSamplingOptions.Default);
        return result;
    }
}
