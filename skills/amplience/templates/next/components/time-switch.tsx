"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { timeStore, type Segment } from "@/lib/time-store";
import { FlashQuiet } from "./change-flash";

/**
 * Time preview, instant mode: the server rendered the page once for each stretch of time between two content changes
 * (`variants`, in order; `boundaries` are the changes, unix ms). Moving the time slider only picks the matching variant
 * here in the browser, with no request. The other variants wait in a hidden container so their images are already loaded.
 */
export function TimeSwitch({ initialTs, boundaries, variants, segments }: { initialTs: number; boundaries: number[]; variants: ReactNode[]; segments: Segment[] }) {
  const [ts, setTs] = useState(initialTs);
  const index = boundaries.filter((b) => b <= ts).length;
  const preload = useRef<HTMLDivElement>(null);

  const segmentsKey = JSON.stringify(segments); // a new array arrives with every server render; only react to real changes
  useEffect(() => {
    timeStore.set({ ts: initialTs, variants: true, segments: JSON.parse(segmentsKey) as Segment[] });
    const off = timeStore.subscribe(() => setTs(timeStore.get().ts));
    return () => {
      off();
      timeStore.set({ variants: false, segments: [] });
    };
  }, [initialTs, segmentsKey]);

  // Images of hidden variants are lazy by default and would only load when shown: load them now.
  useEffect(() => {
    preload.current?.querySelectorAll("img").forEach((img) => {
      img.loading = "eager";
    });
  }, [index]);

  return (
    <>
      <div key={index} className="contents">
        {variants[index]}
      </div>
      <div ref={preload} hidden aria-hidden>
        <FlashQuiet.Provider value>
          {variants.map((v, i) => (i === index ? null : <div key={i}>{v}</div>))}
        </FlashQuiet.Provider>
      </div>
    </>
  );
}
