"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { CONTENT_ENV, STAGING_ID } from "@/lib/amplience";
import { kickBuild, timelineProgress } from "@/lib/timeline";
import { parsePinned, pinnedHost, VSE_COOKIE, VSE_COOKIE_EXPIRED, VSE_COOKIE_OPTIONS } from "@/lib/vse";

/** Moves the session's time preview to `ts` (unix ms), or leaves it with `null`. Preview deployments only. */
export async function setTimePreview(ts: number | null) {
  if (CONTENT_ENV === "production") throw new Error("Time preview is disabled in production");
  const jar = await cookies();
  if (ts !== null && !Number.isFinite(ts)) return;
  if (ts === null) {
    jar.set(VSE_COOKIE, "", VSE_COOKIE_EXPIRED);
    revalidatePath("/", "layout");
    return;
  }
  const token = parsePinned(jar.get(VSE_COOKIE)?.value ?? "")?.token ?? process.env.AMPLIENCE_TIME_TOKEN;
  if (!token) throw new Error("AMPLIENCE_TIME_TOKEN is not set");
  jar.set(VSE_COOKIE, pinnedHost(STAGING_ID, token, ts), VSE_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
}

/** Change points and preload progress for the session's staging environment (slider markers and progress bar). */
export async function getTimeMarkers() {
  const none = { markers: [] as number[], building: false, ranges: [] as { from: number; to: number; done: boolean; changing: boolean }[], builtAt: 0, ready: false };
  if (CONTENT_ENV === "production") return none;
  const pinned = parsePinned((await cookies()).get(VSE_COOKIE)?.value ?? "");
  if (!pinned) return none;
  const progress = await timelineProgress(pinned);
  if (!progress.ready) kickBuild(pinned); // starts or resumes the preload if nobody is on it
  return progress;
}
