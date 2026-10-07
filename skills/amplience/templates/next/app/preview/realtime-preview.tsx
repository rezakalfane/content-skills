"use client";

import { init } from "dc-visualization-sdk";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { renderModel } from "./actions";

const toLocale = (l?: string | null): Locale => (l?.toLowerCase().startsWith("fr") ? "fr" : "en");

/**
 * Real-time visualization: connects to the Amplience content form with the Visualization SDK and re-renders the
 * page (on the server, through an action) on every edit, without saving. Starts from the server-rendered view.
 */
export function RealtimePreview({ initial, initialLocale, schema }: { initial: ReactNode; initialLocale: Locale; schema?: string }) {
  const [view, setView] = useState<ReactNode>(initial);
  const [status, setStatus] = useState<"connecting" | "live" | "standalone">("connecting");
  const state = useRef<{ model?: unknown; locale: Locale; seq: number; timer?: ReturnType<typeof setTimeout> }>({
    locale: initialLocale,
    seq: 0,
  });

  useEffect(() => {
    const s = state.current;
    const unsubscribe: (() => void)[] = [];
    let cancelled = false;

    const render = () => {
      clearTimeout(s.timer);
      s.timer = setTimeout(async () => {
        if (s.model === undefined) return;
        const n = ++s.seq;
        try {
          const node = await renderModel(s.model, s.locale, schema);
          if (!cancelled && n === s.seq) setView(node);
        } catch (e) {
          console.error("preview render failed", e);
        }
      }, 150);
    };

    (async () => {
      try {
        const sdk = await Promise.race([init(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no host")), 4000))]);
        if (cancelled) return;
        s.locale = toLocale(await sdk.locale.get());
        s.model = await sdk.form.get({ allowInvalid: true });
        setStatus("live");
        unsubscribe.push(
          sdk.form.changed((model: unknown) => {
            s.model = model;
            render();
          }),
          sdk.locale.changed((l: string | null) => {
            s.locale = toLocale(l);
            render();
          }),
        );
        render();
      } catch {
        // Opened outside the Amplience content form (no iframe host): keep the server-rendered view.
        if (!cancelled) setStatus("standalone");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(s.timer);
      unsubscribe.forEach((u) => u());
    };
  }, [schema]);

  return (
    <>
      <div className="pointer-events-none fixed right-3 top-3 z-50 rounded-[3px] bg-ink px-2.5 py-1 text-xs font-semibold text-white">
        {status === "live" ? "● Live preview" : status === "connecting" ? "Connecting…" : "Preview (saved content)"}
      </div>
      {view}
    </>
  );
}
