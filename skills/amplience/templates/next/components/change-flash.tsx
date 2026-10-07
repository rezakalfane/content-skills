"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

declare global {
  interface Window {
    __timeTravelAt?: number;
  }
}

/** Provided around the hidden, preloaded copies of the other time states: they must not trigger or reset any blink. */
export const FlashQuiet = createContext(false);

/** Last content signature seen per area (page path + area id), so a blink survives the area being re-mounted. */
const seen = new Map<string, string>();

/**
 * While time traveling, outlines an area for a moment when its content changed (a dotted amber blink). `sig` is a hash
 * of the area's content, compared with what the same area (`id`) showed before, even when switching to another time
 * state re-mounts it. An area that appears right after the time was moved (for example a hero whose slot just got
 * content) also blinks; first paint never does.
 */
export function ChangeFlash({ id, sig, children }: { id: string; sig: string; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const quiet = useContext(FlashQuiet);
  const path = usePathname();

  useEffect(() => {
    const node = el.current;
    if (!node || quiet) return;
    const key = `${path}::${id}`;
    const prev = seen.get(key);
    seen.set(key, sig);
    const justMoved = Date.now() - (window.__timeTravelAt ?? 0) < 8000;
    if (prev === undefined ? !justMoved : prev === sig) return;
    node.classList.remove("time-flash");
    void node.offsetWidth; // restart the animation if it was still running
    node.classList.add("time-flash");
    const t = setTimeout(() => node.classList.remove("time-flash"), 2200);
    return () => clearTimeout(t);
  }, [sig, id, path, quiet]);

  return <div ref={el}>{children}</div>;
}
