using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Tilewright.Server.Storage;

namespace Tilewright.Server.Auth;

public sealed class SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    ISessionStore sessions,
    IUserStore users)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "TilewrightSession";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var rawToken = SessionCookieHelper.ReadToken(Request);
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return AuthenticateResult.NoResult();
        }

        var session = await sessions.ValidateAsync(rawToken, Context.RequestAborted);
        if (session is null)
        {
            return AuthenticateResult.Fail("Invalid or expired session.");
        }

        var user = await users.GetByIdAsync(session.UserId, Context.RequestAborted);
        if (user is null)
        {
            await sessions.RevokeAllForUserAsync(session.UserId, Context.RequestAborted);
            return AuthenticateResult.Fail("Session user no longer exists.");
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("session_id", session.Id)
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return AuthenticateResult.Success(ticket);
    }
}
