import { NextResponse, type NextRequest } from "next/server";
import { CONTENT_ENV, STAGING_ID } from "@/lib/amplience";
import { warmRequests } from "@/lib/content";
import { warmTimeline } from "@/lib/timeline";

/** The build runs inside this request, so give the function room to finish it. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Builds the time travel timeline ahead of time, so the first visitor of a demo does not wait for it. Called by the
 * "Warm timeline" GitHub Action when a Preview deployment is ready (the timeline lives in the project's Runtime Cache, shared by
 * all preview deployments), or by hand:
 *
 *   curl -H "x-warm-token: $WARM_TOKEN" https://<preview-url>/api/warm
 *
 * Preview deployments only, and only with the shared secret `WARM_TOKEN`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.WARM_TOKEN;
  const token = process.env.AMPLIENCE_TIME_TOKEN;
  if (CONTENT_ENV === "production" || !secret || request.headers.get("x-warm-token") !== secret) return new NextResponse("Not found", { status: 404 });
  if (!token) return NextResponse.json({ error: "AMPLIENCE_TIME_TOKEN is not set" }, { status: 500 });
  const keys = warmRequests();
  const started = Date.now();
  // Builds in this very request (up to maxDuration) so the caller sees the real outcome.
  const progress = await warmTimeline({ id: STAGING_ID, token, ts: started }, keys);
  return NextResponse.json({
    requests: keys.length,
    ready: progress.ready,
    building: progress.building,
    markers: progress.markers.length,
    builtAt: progress.builtAt ? new Date(progress.builtAt).toISOString() : null,
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
