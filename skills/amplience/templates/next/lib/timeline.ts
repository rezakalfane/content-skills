import { after } from "next/server";
import { gunzipSync, gzipSync } from "node:zlib";
import { cache as perRender } from "react";
import { getCache } from "@vercel/functions";
import { hash } from "./hash";
import { pinnedHost } from "./vse";

/**
 * Time travel cache (preview deployments only).
 *
 * Content pinned to a moment only changes at a few instants (an Edition starting, a slot being published), so instead
 * of asking Amplience for every slider step we build a **timeline**: the content for each stretch of time between two
 * changes. It is built in the background the first time a request is seen under a time pin:
 *   1. probe the slider's range at a couple of dozen instants, left to right;
 *   2. wherever two neighbouring probes differ, bisect down to the hour to find the exact change point.
 * A gap between two probes is **resolved** as soon as it is known (both probes equal, or its bisection finished) and
 * answers from the cache immediately, even while the rest is still loading. The slider shows this as a progress bar
 * and the change points as markers.
 *
 * Shared state. On Vercel every request may reach a different function instance, so the timeline lives in the
 * **Runtime Cache** (a per-region store shared by all instances; separate for Production and Preview): a small *plan*
 * (which instants were probed, which state each shows) and one gzipped blob per distinct content *state*. One instance
 * builds at a time (a soft lock); a stale plan keeps serving until its replacement is complete, so the slider never
 * "unloads". Outside Vercel an in-process map stands in for the Runtime Cache.
 *
 * Amplience limits virtual staging to 7 requests/s (350/min, shared with every other staging read), so background
 * requests are paced (see `pace` in lib/amplience.ts). Every instant is its own host (a DNS lookup and TLS connection),
 * so one probe loads *all* requests of the timeline from the same host. Changes shorter than the probe gap (about 4
 * weeks) can be missed.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RANGE = { before: 30 * DAY, after: 365 * DAY };
const SAMPLES = 15;
const CONCURRENCY = 4;
const SOFT_TTL = 5 * 60_000; // after this a rebuild starts on use (the old plan keeps serving until it is replaced)
const HARD_TTL = 4 * 3600; // seconds, in the shared cache: an idle gap should not mean a cold start
const LOCK_MS = 30_000;

type Pin = { id: string; token: string; ts: number };
/** `background` marks requests made by the timeline itself, which are rate paced. */
export type Loader = (host: string, background: boolean) => Promise<unknown>;
type Sample = { t: number; h: string };
type Plan = {
  keys: string[];
  min: number;
  max: number;
  instants: number[];
  samples: (Sample | null)[];
  refined: (Sample[] | null)[]; // per gap: change points inside (instants[i], instants[i+1]]
  complete: boolean;
  builtAt: number;
  updatedAt: number;
};
type States = Record<string, unknown>; // request key -> content, for one state

// ---------------------------------------------------------------- shared store
type Store = { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown, ttl: number): Promise<void> };
const g = globalThis as unknown as { __tlMem?: Map<string, { v: unknown; exp: number }>; __tlLocal?: Map<string, Local>; __tlId?: string; __tlKnown?: Set<string> };
const mem = (g.__tlMem ??= new Map());
const memoryStore: Store = {
  async get<T>(key: string) {
    const hit = mem.get(key);
    return hit && hit.exp > Date.now() ? (hit.v as T) : undefined;
  },
  async set(key, value, ttl) {
    mem.set(key, { v: value, exp: Date.now() + ttl * 1000 });
  },
};
const runtimeStore: Store = {
  async get<T>(key: string) {
    try {
      return (await getCache({ namespace: "timeline" }).get(key)) as T | undefined;
    } catch {
      return memoryStore.get<T>(key);
    }
  },
  async set(key, value, ttl) {
    try {
      await getCache({ namespace: "timeline" }).set(key, value, { ttl, name: "time-travel" });
    } catch {
      await memoryStore.set(key, value, ttl);
    }
  },
};
const store = process.env.VERCEL ? runtimeStore : memoryStore;
const INSTANCE = (g.__tlId ??= Math.random().toString(36).slice(2));

const planKey = (p: { id: string; token: string }) => `${p.id}:${p.token}:plan`;
const lockKey = (p: { id: string; token: string }) => `${p.id}:${p.token}:lock`;
/** Progress of a replacement build, kept apart so the plan being served stays untouched until the new one is complete. */
const nextKey = (p: { id: string; token: string }) => `${p.id}:${p.token}:next`;
/** Every request key any instance has registered for this environment (so any instance can build the whole timeline). */
const keysKey = (p: { id: string; token: string }) => `${p.id}:${p.token}:keys`;
const stateKey = (h: string) => `state:${h}`;
const encode = (s: States) => gzipSync(JSON.stringify(s)).toString("base64");
const decode = (b: string) => JSON.parse(gunzipSync(Buffer.from(b, "base64")).toString()) as States;

// Within one render several requests ask for the plan / a state: read each once.
const readPlan = perRender((key: string) => store.get<Plan>(key));
const readState = perRender(async (h: string) => {
  const blob = await store.get<string>(stateKey(h));
  return blob ? decode(blob) : undefined;
});

// ---------------------------------------------------------------- local (per instance) bookkeeping
type Local = { loaders: Map<string, Loader>; queued: boolean; building: boolean };
const locals = (g.__tlLocal ??= new Map<string, Local>());
let resolver: ((reqKey: string) => Loader | undefined) | undefined;
/** Lets a build load requests that were registered by another instance (the request key says what to load). */
export const setResolver = (fn: (reqKey: string) => Loader | undefined) => {
  resolver = fn;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((go) => waiting.push(go));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
async function retry<T>(task: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await task();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(300 * 2 ** i);
    }
  }
}

// ---------------------------------------------------------------- lookups
/** Hash of the content state at `ts`, or undefined while its gap is unresolved. */
function stateAt(plan: Plan, ts: number): string | undefined {
  if (ts < plan.min || ts > plan.max) return undefined;
  let i = plan.instants.length - 2;
  while (i > 0 && plan.instants[i] > ts) i--;
  const a = plan.samples[i];
  const b = plan.samples[i + 1];
  if (!a || !b) return undefined;
  if (a.h === b.h) return a.h;
  const changes = plan.refined[i];
  if (!changes) return undefined;
  let cur = a;
  for (const c of changes) {
    if (c.t <= ts) cur = c;
    else break;
  }
  return cur.h;
}

/** Content for `pin.ts`: from the shared timeline when its gap is resolved, else straight from Amplience (and a build is queued). */
export async function timelined<T>(reqKey: string, pin: Pin, load: Loader): Promise<T> {
  const local = locals.get(planKey(pin)) ?? { loaders: new Map<string, Loader>(), queued: false, building: false };
  locals.set(planKey(pin), local);
  local.loaders.set(reqKey, load);
  const known = (g.__tlKnown ??= new Set<string>());
  if (!known.has(`${planKey(pin)}|${reqKey}`)) {
    known.add(`${planKey(pin)}|${reqKey}`);
    void store.get<string[]>(keysKey(pin)).then((cur) => store.set(keysKey(pin), [...new Set([...(cur ?? []), reqKey])], HARD_TTL));
  }

  const plan = await readPlan(planKey(pin));
  const h = plan && stateAt(plan, pin.ts);
  const state = h ? await readState(h) : undefined;
  if (state && reqKey in state) return state[reqKey] as T;

  if (!local.queued) {
    local.queued = true;
    // `after` keeps the function alive until the build ends: Vercel freezes a function once its response is sent.
    const task = () => maybeBuild(local, pin).finally(() => (local.queued = false));
    try {
      after(task);
    } catch {
      void task(); // outside a request scope there is nothing to keep alive
    }
  }
  return retry(() => load(pinnedHost(pin.id, pin.token, pin.ts), false)) as Promise<T>;
}

async function maybeBuild(local: Local, pin: Pin, debounce = true) {
  if (local.building) return;
  if (debounce) await sleep(400); // let the render that triggered this register all of its requests
  const shared = await store.get<Plan>(planKey(pin));
  const keys = new Set([...local.loaders.keys(), ...(shared?.keys ?? []), ...((await store.get<string[]>(keysKey(pin))) ?? [])]);
  const covered = shared ? [...keys].every((k) => shared.keys.includes(k)) : false;
  const fresh = Boolean(shared?.complete && Date.now() - shared.builtAt < SOFT_TTL);
  if (fresh && covered) return;
  const lock = await store.get<{ owner: string; at: number }>(lockKey(pin));
  if (lock && Date.now() - lock.at < LOCK_MS && lock.owner !== INSTANCE) return; // someone else is on it
  local.building = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await build(local, pin, [...keys], shared);
        return;
      } catch (e) {
        // typically a rate limit: try again after a pause (progress already shared is kept)
        console.error("[timeline] build interrupted:", e instanceof Error ? e.message : e);
        await sleep(4000);
      }
    }
  } finally {
    local.building = false;
  }
}

async function build(local: Local, pin: Pin, wanted: string[], previous: Plan | undefined) {
  const started = Date.now();
  const loaders = new Map<string, Loader>();
  for (const k of wanted) {
    const l = local.loaders.get(k) ?? resolver?.(k);
    if (l) loaders.set(k, l);
  }
  const keys = [...loaders.keys()];
  const min = started - RANGE.before - DAY;
  const max = started + RANGE.after + DAY;
  // Pick up an interrupted build of the same requests (its states were stored before its plan was).
  const unfinished = await store.get<Plan>(nextKey(pin));
  const resume = unfinished && !unfinished.complete && unfinished.keys.length === keys.length && keys.every((k) => unfinished.keys.includes(k)) && Date.now() - unfinished.updatedAt < 10 * 60_000;
  const plan: Plan = resume ? unfinished : {
    keys,
    min,
    max,
    instants: Array.from({ length: SAMPLES }, (_, i) => Math.round((min + ((max - min) * i) / (SAMPLES - 1)) / HOUR) * HOUR),
    samples: new Array(SAMPLES).fill(null),
    refined: new Array(SAMPLES - 1).fill(null),
    complete: false,
    builtAt: started,
    updatedAt: started,
  };
  const states = new Map<string, States>();
  const written = new Set<string>();
  // While an earlier complete plan exists it keeps serving; the new one replaces it only when it is complete.
  const replacing = Boolean(previous?.complete);

  const persist = async (final: boolean) => {
    for (const [h, s] of states) {
      if (!written.has(h)) {
        await store.set(stateKey(h), encode(s), HARD_TTL);
        written.add(h);
      }
    }
    plan.complete = final;
    plan.updatedAt = Date.now();
    if (final) plan.builtAt = Date.now();
    // A replacement keeps its progress apart; the plan being served is swapped only when the new one is complete.
    await store.set(final || !replacing ? planKey(pin) : nextKey(pin), plan, HARD_TTL);
    if (final && replacing) await store.set(nextKey(pin), { ...plan, complete: true }, 1);
  };
  const beat = setInterval(() => {
    void store.set(lockKey(pin), { owner: INSTANCE, at: Date.now() }, 60);
    void persist(false);
  }, 1200);
  await store.set(lockKey(pin), { owner: INSTANCE, at: Date.now() }, 60);

  // One probe = every request against one instant's host (a single connection), a few probes at a time.
  const at = (t: number) =>
    limited(async () => {
      const host = pinnedHost(pin.id, pin.token, t);
      const results = await retry(() => Promise.all(keys.map((k) => loaders.get(k)!(host, true))));
      const content: States = Object.fromEntries(keys.map((k, i) => [k, results[i]]));
      // Staging rewrites some links (images) to its own host, which carries the timestamp: blank it before comparing,
      // otherwise every instant would look different from its neighbours.
      const h = hash(results.map((r) => JSON.stringify(r) ?? "").join("\u0001").split(host).join(""));
      if (!states.has(h)) states.set(h, content);
      return { t, h } satisfies Sample;
    });

  // Change points inside (lo, hi]: bisect to the hour; a third state in the middle is found by recursing on both halves.
  const refine = async (lo: Sample, hi: Sample): Promise<Sample[]> => {
    if (lo.h === hi.h) return [];
    if (hi.t - lo.t <= HOUR) return [hi];
    const mid = await at(lo.t + Math.max(HOUR, Math.floor((hi.t - lo.t) / 2 / HOUR) * HOUR));
    const [a, b] = await Promise.all([refine(lo, mid), refine(mid, hi)]);
    return [...a, ...b];
  };
  const settling = new Set<number>();
  const settle = async (i: number) => {
    const a = plan.samples[i];
    const b = plan.samples[i + 1];
    if (!a || !b || a.h === b.h || plan.refined[i] || settling.has(i)) return;
    settling.add(i);
    plan.refined[i] = await refine(a, b);
  };

  try {
    // 1. probe the whole range (fills in every gap whose two ends agree)
    await Promise.all(
      plan.instants.map(async (t, i) => {
        plan.samples[i] = await at(t);
      }),
    );
    await persist(false);
    // 2. find the change points, left to right, two gaps at a time: markers and edition bands appear one after the other
    //    instead of all at the very end
    const queue = plan.refined.map((_, i) => i).filter((i) => plan.samples[i] && plan.samples[i + 1] && plan.samples[i]!.h !== plan.samples[i + 1]!.h && !plan.refined[i]);
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        for (let i = queue.shift(); i !== undefined; i = queue.shift()) await settle(i);
      }),
    );
    await persist(true);
    console.log(`[timeline] ready in ${((Date.now() - started) / 1000).toFixed(1)}s: ${keys.length} requests per probe, ${states.size} states`);
  } finally {
    clearInterval(beat);
  }
}

/**
 * Registers requests for this environment and builds their timeline NOW, inside the calling request (used by /api/warm, which
 * stays open until it is done: work left running after a response is not dependable on serverless). Returns the resulting progress.
 */
export async function warmTimeline(pin: Pin, reqKeys: string[]): Promise<Progress> {
  const local = locals.get(planKey(pin)) ?? { loaders: new Map<string, Loader>(), queued: false, building: false };
  locals.set(planKey(pin), local);
  for (const k of reqKeys) {
    const l = resolver?.(k);
    if (l) local.loaders.set(k, l);
  }
  const cur = (await store.get<string[]>(keysKey(pin))) ?? [];
  await store.set(keysKey(pin), [...new Set([...cur, ...reqKeys])], HARD_TTL);
  await maybeBuild(local, pin, false); // returns at once when the timeline is fresh and covers everything, or someone else is building
  return timelineProgress(pin);
}

/**
 * Called by the status polling: a build that died (a function instance stopped mid-way) is picked up again from where
 * it left off, without waiting for someone to load a page.
 */
export function kickBuild(pin: Pin) {
  const local = locals.get(planKey(pin)) ?? { loaders: new Map<string, Loader>(), queued: false, building: false };
  locals.set(planKey(pin), local);
  if (local.queued || local.building) return;
  local.queued = true;
  const task = () => maybeBuild(local, pin, false).finally(() => (local.queued = false));
  try {
    after(task);
  } catch {
    void task();
  }
}

// ---------------------------------------------------------------- progress for the UI
export type Progress = {
  markers: number[];
  building: boolean;
  /** `changing`: the content differs between the two ends but the exact change point is not found yet. */
  ranges: { from: number; to: number; done: boolean; changing: boolean }[];
  /** When the served plan was built: a change means a fresher timeline replaced it. */
  builtAt: number;
  /** The preload is complete and covers every request this instance has seen: pages can be rendered per time state. */
  ready: boolean;
};

/** Change points, resolved ranges and build state for this staging environment (slider markers and progress bar). */
export async function timelineProgress(pin: { id: string; token: string }): Promise<Progress> {
  const plan = await readPlan(planKey(pin));
  if (!plan) return { markers: [], building: false, ranges: [], builtAt: 0, ready: false };
  const markers = new Set<number>();
  plan.refined.forEach((r) => r?.forEach((c) => markers.add(c.t)));
  const ranges = plan.instants.slice(0, -1).map((from, i) => {
    const a = plan.samples[i];
    const b = plan.samples[i + 1];
    return { from, to: plan.instants[i + 1], done: Boolean(a && b && (a.h === b.h || plan.refined[i])), changing: Boolean(a && b && a.h !== b.h && !plan.refined[i]) };
  });
  const seen = [...(locals.get(planKey(pin))?.loaders.keys() ?? [])];
  return {
    markers: [...markers].sort((a, b) => a - b),
    building: !plan.complete && Date.now() - plan.updatedAt < LOCK_MS,
    ranges,
    builtAt: plan.builtAt,
    ready: plan.complete && seen.every((k) => plan.keys.includes(k)),
  };
}
