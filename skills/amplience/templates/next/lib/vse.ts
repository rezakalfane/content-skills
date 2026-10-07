/** Virtual staging hosts Amplience hands to preview apps (`vse.domain`); anything else is ignored. */
export const VSE_HOST = /^[a-z0-9-]+\.staging\.bigcontent\.io$/i;
export const VSE_COOKIE = "amp_vse";

/**
 * A time-pinned virtual staging host serves the content exactly as it will be at one moment (slots and Editions
 * resolved): `<vse id>-<token>-<unix ms>.staging.bigcontent.io`. Amplience preview apps receive such a host as
 * `vse.domain`; the timestamp can be swapped to travel in time.
 */
const PINNED = /^([a-z0-9]+)-([a-z0-9]+)-(\d{10,14})\.staging\.bigcontent\.io$/i;

export function parsePinned(host: string) {
  const m = PINNED.exec(host);
  return m ? { id: m[1], token: m[2], ts: Number(m[3]) } : undefined;
}

export const pinnedHost = (id: string, token: string, ts: number) => `${id}-${token}-${Math.round(ts)}.staging.bigcontent.io`;

/** Options for the pin cookie: the site is framed by app.amplience.net, hence SameSite=None and partitioned. */
export const VSE_COOKIE_OPTIONS = { path: "/", secure: true, sameSite: "none", partitioned: true } as const;

/** A partitioned cookie is only removed by a Set-Cookie that repeats its attributes, so expire it with the same options. */
export const VSE_COOKIE_EXPIRED = { ...VSE_COOKIE_OPTIONS, maxAge: 0 } as const;
