import { NextResponse, type NextRequest } from "next/server";
import { parsePinned, pinnedHost, VSE_COOKIE, VSE_COOKIE_EXPIRED, VSE_COOKIE_OPTIONS, VSE_HOST } from "@/lib/vse";

/**
 * Locale routing. English (default) has clean URLs and is rewritten internally to /en/...;
 * French lives under /fr. An explicit /en prefix redirects to the clean URL so each page has one address.
 */
function route(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === "fr") return NextResponse.next();

  if (first === "en") {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/en/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

/**
 * Preview deployments can pin a session to other content:
 *  - `?vse=<domain>`: Amplience preview apps pass a virtual staging domain frozen at the date or edition being previewed;
 *  - `?time=<date or ISO time>`: travel to that moment yourself (needs `AMPLIENCE_TIME_TOKEN`; the banner then lets you move on);
 *  - `?vse=reset` or `?time=now`: back to the latest saved content.
 * Stored in a cookie so the whole session reads that content. Ignored in production.
 */
export function proxy(request: NextRequest) {
  if (!process.env.AMPLIENCE_DELIVERY_HOST?.includes("staging")) return route(request);
  const params = request.nextUrl.searchParams;
  const vse = params.get("vse");
  const time = params.get("time");
  if (!vse && !time) return route(request);

  // Apply the parameter once, then redirect to the clean URL: later requests (including Server Actions posted to
  // this URL) must not re-apply it over a time chosen in the banner.
  const clean = request.nextUrl.clone();
  clean.searchParams.delete("vse");
  clean.searchParams.delete("time");
  const response = NextResponse.redirect(clean, 307);
  if (vse === "reset" || time === "now") {
    response.cookies.set(VSE_COOKIE, "", VSE_COOKIE_EXPIRED);
  } else if (vse && VSE_HOST.test(vse)) {
    response.cookies.set(VSE_COOKIE, vse, VSE_COOKIE_OPTIONS);
  } else if (time) {
    const ts = Date.parse(time);
    const base = process.env.AMPLIENCE_DELIVERY_HOST.split(".")[0];
    const token = parsePinned(request.cookies.get(VSE_COOKIE)?.value ?? "")?.token ?? process.env.AMPLIENCE_TIME_TOKEN;
    if (!Number.isNaN(ts) && token) response.cookies.set(VSE_COOKIE, pinnedHost(base, token, ts), VSE_COOKIE_OPTIONS);
  }
  return response;
}

export const config = {
  // Skip Next internals, the Amplience visualization route and any path with a file extension (images, favicon, etc.)
  matcher: ["/((?!_next|api|preview|.*\\..*).*)"],
};
