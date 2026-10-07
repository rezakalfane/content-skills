import { Fragment, type ReactNode } from "react";
import { getTimePreview } from "@/lib/amplience";
import { timelineProgress } from "@/lib/timeline";
import { TimeSwitch } from "./time-switch";

const HOUR = 3_600_000;

/**
 * Renders `render()` as usual, except during a time preview whose timeline is fully preloaded: then it renders the page
 * once for every stretch of time between two content changes and lets the browser switch between them instantly
 * (components/time-switch.tsx). `render(at)` must read its content as of `at`; `label(at)` names that stretch of time
 * (shown on the slider's timeline).
 */
export async function TimeVariants({ render, label }: { render: (at?: number) => ReactNode; label?: (at: number) => Promise<string | undefined> }) {
  const time = await getTimePreview();
  if (!time) return <>{render()}</>;
  const { markers, ready } = await timelineProgress(time);
  if (!ready || markers.length === 0) return <>{render()}</>;

  const starts = [markers[0] - HOUR, ...markers]; // an instant inside each stretch: before the first change, then each change
  const labels = await Promise.all(starts.map((at) => label?.(at)));
  return (
    <TimeSwitch
      initialTs={time.ts}
      boundaries={markers}
      segments={starts.map((at, i) => ({ from: i === 0 ? 0 : at, label: labels[i] }))}
      variants={starts.map((at) => (
        <Fragment key={at}>{render(at)}</Fragment>
      ))}
    />
  );
}
