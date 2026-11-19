using Tilewright.Server.Models;

namespace Tilewright.Server.Auth;

public static class SessionCookieHelper
{
    public const string HttpCookieName = "tw_session";
    public const string HttpsCookieName = "__Host-tw_session";

    public static bool ShouldUseSecureCookie(HttpContext context, SiteSettings site) =>
        context.Request.IsHttps || site.ForceSecureCookies;

    public static string GetCookieName(HttpContext context, SiteSettings site) =>
        ShouldUseSecureCookie(context, site) ? HttpsCookieName : HttpCookieName;

    public static string? ReadToken(HttpRequest request)
    {
        if (request.Cookies.TryGetValue(HttpsCookieName, out var httpsToken) && !string.IsNullOrWhiteSpace(httpsToken))
        {
            return httpsToken;
        }

        if (request.Cookies.TryGetValue(HttpCookieName, out var httpToken) && !string.IsNullOrWhiteSpace(httpToken))
        {
            return httpToken;
        }

        return null;
    }

    public static void AppendSessionCookie(HttpContext context, SiteSettings site, string rawToken)
    {
        var secure = ShouldUseSecureCookie(context, site);
        var name = secure ? HttpsCookieName : HttpCookieName;

        context.Response.Cookies.Append(name, rawToken, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = secure,
            Path = "/",
            IsEssential = true,
            MaxAge = TimeSpan.FromDays(365)
        });
    }

    public static void ClearSessionCookies(HttpContext context, SiteSettings site)
    {
        var secure = ShouldUseSecureCookie(context, site);
        context.Response.Cookies.Delete(HttpCookieName, new CookieOptions { Path = "/", SameSite = SameSiteMode.Lax });
        if (secure)
        {
            context.Response.Cookies.Delete(HttpsCookieName, new CookieOptions { Path = "/", Secure = true, SameSite = SameSiteMode.Lax });
        }
    }
}
