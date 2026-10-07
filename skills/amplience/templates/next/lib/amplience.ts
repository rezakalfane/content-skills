import { cookies } from "next/headers";
import { cache } from "react";
import type { Locale } from "./i18n";
import { setResolver, timelined } from "./timeline";
import { parsePinned, VSE_COOKIE, VSE_HOST } from "./vse";

/**
 * Amplience Delivery API client (read only).
 *
 * `AMPLIENCE_DELIVERY_HOST` selects the content environment:
 *   - production: `<hub>.cdn.content.amplience.net`   (published content, CDN cached)
 *   - preview:    `<id>.staging.bigcontent.io`          (virtual staging: latest saved content, nothing to publish)
 */
const HUB = process.env.AMPLIENCE_HUB_NAME ?? "";
export const DELIVERY_HOST = process.env.AMPLIENCE_DELIVERY_HOST || `${HUB}.cdn.content.amplience.net`;
export const CONTENT_ENV: "production" | "preview" = DELIVERY_HOST.includes("staging") ? "preview" : "production";

/** URL locale -> Amplience locales, in fallback order (field-level localization falls back to English). */
export const AMP_LOCALES: Record<Locale, string> = { en: "en-US", fr: "fr-FR,en-US" };

/**
 * Host to read content from. Preview deployments can be pinned to another virtual staging domain for a session
 * (Amplience preview apps open the site with `?vse=<domain>`, a domain frozen at the date or edition being previewed;
 * `proxy.ts` stores it in a cookie). Production always reads the CDN.
 */
async function host(): Promise<string> {
  if (CONTENT_ENV === "production") return DELIVERY_HOST;
  const pinned = (await cookies()).get(VSE_COOKIE)?.value;
  return pinned && VSE_HOST.test(pinned) ? pinned : DELIVERY_HOST;
}

/** The session's time preview (preview deployments only): content as of `ts`, read from a time-pinned host. */
export async function getTimePreview(): Promise<{ ts: number; now: number; id: string; token: string } | undefined> {
  if (CONTENT_ENV === "production") return undefined;
  const pinned = (await cookies()).get(VSE_COOKIE)?.value;
  const parsed = pinned && VSE_HOST.test(pinned) ? parsePinned(pinned) : undefined;
  return parsed ? { ts: parsed.ts, now: Date.now(), id: parsed.id, token: parsed.token } : undefined;
}

/** Host id (`<vse id>`) of the configured staging host, the base for time-pinned hosts. */
export const STAGING_ID = DELIVERY_HOST.split(".")[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Virtual staging allows 7 requests/s (350/min) per environment, shared by every read. Background requests (the time
 * travel preload, see lib/timeline.ts) are paced to ~6/s to leave room for pages; pages themselves are never delayed.
 */
const pacer = ((globalThis as unknown as { __ampPacer?: { next: number } }).__ampPacer ??= { next: 0 });
async function pace() {
  const slot = Math.max(Date.now(), pacer.next);
  pacer.next = slot + 160; // ~6 requests/s: the limit is 7/s, shared with the pages themselves
  if (slot > Date.now()) await sleep(slot - Date.now());
}

/** `fetch` that backs off exponentially on 429 (the documented way to handle Amplience rate limits). */
async function amp(url: string, init: RequestInit, background: boolean): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    if (background) await pace();
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= 5) return res;
    await sleep(Math.min(8000, 400 * 2 ** attempt) + Math.random() * 200);
  }
}

const PARAMS = (locale: Locale) => ({ depth: "all", format: "inlined", locale: AMP_LOCALES[locale] });
const NEXT_OPTS = CONTENT_ENV === "preview" ? { cache: "no-store" as const } : { next: { revalidate: 60 } };

export const schemaId = (name: string) => `https://content.commerce.com/${name}`;

/** The session's time pin (preview deployments only), when the host is a time-pinned virtual staging domain. */
async function pinOf(at?: number) {
  const pin = CONTENT_ENV === "preview" ? parsePinned(await host()) : undefined;
  // `at` reads the same environment at another instant (used to render every time state of a page in one go).
  return pin && at !== undefined ? { ...pin, ts: at } : pin;
}

async function fetchKey<T>(h: string, key: string, locale: Locale, background = false): Promise<T | undefined> {
  const qs = new URLSearchParams(PARAMS(locale));
  const res = await amp(`https://${h}/content/key/${key}?${qs}`, NEXT_OPTS, background);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Amplience ${res.status} for key "${key}"`);
  return ((await res.json()) as { content: T }).content;
}

/** The request keys the timeline stores things under (also used to warm it up front, see app/api/warm). */
export const keyRequest = (key: string, locale: Locale) => `key:${key}:${locale}`;
export const listRequest = (request: FilterRequest, locale: Locale) => `list:${JSON.stringify(request)}:${locale}`;

// React `cache` de-duplicates identical reads within one render (the layout and the page both ask for navigation).
const byKey = cache(async (key: string, locale: Locale, at?: number): Promise<unknown> => {
  const pin = await pinOf(at);
  return pin ? timelined(keyRequest(key, locale), pin, (h, bg) => fetchKey(h, key, locale, bg)) : fetchKey(await host(), key, locale);
});

/** One content item by delivery key (e.g. `home`, `blog/my-post`), localized and with links resolved. */
export async function getByKey<T>(key: string, locale: Locale, at?: number): Promise<T | undefined> {
  return (await byKey(key, locale, at)) as T | undefined;
}

export type FilterRequest = { schema: string; where?: Record<string, string>; sort?: "DESC" | "ASC" };

async function fetchAll<T>(h: string, { schema, where = {}, sort }: FilterRequest, locale: Locale, background = false): Promise<T[]> {
  const filterBy = [{ path: "/_meta/schema", value: schemaId(schema) }, ...Object.entries(where).map(([path, value]) => ({ path, value }))];
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const res = await amp(`https://${h}/content/filter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filterBy,
        ...(sort ? { sortBy: { key: "default", order: sort } } : {}),
        parameters: PARAMS(locale),
        page: { size: 12, ...(cursor ? { cursor } : {}) },
      }),
      ...NEXT_OPTS,
    }, background);
    if (!res.ok) throw new Error(`Amplience filter ${res.status} for ${schema}`);
    const body = (await res.json()) as { responses?: { content: T }[]; page?: { nextCursor?: string } };
    out.push(...(body.responses ?? []).map((r) => r.content));
    cursor = body.page?.nextCursor;
  } while (cursor);
  return out;
}

const listed = cache(async (request: string, locale: Locale, at?: number): Promise<unknown[]> => {
  const req = JSON.parse(request) as FilterRequest;
  const pin = await pinOf(at);
  return pin ? timelined(`list:${request}:${locale}`, pin, (h, bg) => fetchAll(h, req, locale, bg)) : fetchAll(await host(), req, locale);
});

/** All items of a content type (the Filter API returns at most 12 per page, so follow the cursor). */
export async function listBySchema<T>(request: FilterRequest, locale: Locale, at?: number): Promise<T[]> {
  return (await listed(JSON.stringify(request), locale, at)) as T[];
}

// ---------------------------------------------------------------- images
type ImageLink = { id: string; name: string; endpoint: string; defaultHost: string };
export type RawImage = { image?: ImageLink; altText?: string };

/** Published assets are always served by the media CDN (virtual staging rewrites `defaultHost` to its own domain). */
const MEDIA_HOST = "cdn.media.amplience.net";

/** Dynamic Imaging URL of an `image` content item (sized by the image loader at render time). */
export function imageOf(item?: RawImage): { url: string; alt: string } | undefined {
  const l = item?.image;
  return l ? { url: `https://${MEDIA_HOST}/i/${l.endpoint}/${encodeURIComponent(l.name)}`, alt: item?.altText ?? "" } : undefined;
}

// A timeline build may need requests that another function instance registered: the request key says what to load.
setResolver((reqKey) => {
  const locale = reqKey.slice(reqKey.lastIndexOf(":") + 1) as Locale;
  if (reqKey.startsWith("key:")) {
    const key = reqKey.slice(4, reqKey.lastIndexOf(":"));
    return (h, bg) => fetchKey(h, key, locale, bg);
  }
  if (reqKey.startsWith("list:")) {
    const req = JSON.parse(reqKey.slice(5, reqKey.lastIndexOf(":"))) as FilterRequest;
    return (h, bg) => fetchAll(h, req, locale, bg);
  }
  return undefined;
});
