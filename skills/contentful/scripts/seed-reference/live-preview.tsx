"use client";

import { ContentfulLivePreview } from "@contentful/live-preview";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { updatePreviewOverlay, type PreviewEdit } from "@/app/actions/preview";
import { isOverlayValue, type OverlayValue, type PreviewEntity } from "@/lib/contentful";

type Entity = { sys: { type: "Entry"; id: string }; fields: Record<string, unknown> };

/** Every entry found in the editor's answer: it may be the whole data tree we subscribed with, or a single updated entry. */
function entitiesIn(node: unknown, out: Entity[] = []): Entity[] {
  if (Array.isArray(node)) node.forEach((n) => entitiesIn(n, out));
  else if (node && typeof node === "object") {
    const o = node as { sys?: { id?: unknown }; fields?: unknown };
    if (typeof o.sys?.id === "string" && o.fields && typeof o.fields === "object") out.push(o as Entity);
    else Object.values(o).forEach((n) => entitiesIn(n, out));
  }
  return out;
}

/** A field value as the editor sends it: plain for one locale, or keyed by locale code when it carries every locale. */
function localized(value: unknown, locale: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value) && locale in (value as object) ? (value as Record<string, unknown>)[locale] : value;
}

/**
 * Starts the Live Preview SDK inside Contentful's content preview.
 *
 * - Inspector mode: click a tagged element to open its field in the editor.
 * - Typing: the SDK sends the entries of the page to the editor, which answers with their unsaved values. Changed fields
 *   are sent to the server (`updatePreviewOverlay`), which stores them and re-renders the page in the same response, so changes show up as they are made:
 *   text and dates, numbers, booleans, lists and rich text. Links to entries and media are not overlaid; they appear after the entry is saved.
 * - Saving: the overlays and the short draft cache are dropped and the page is re-rendered from the Preview API.
 *   `enableLiveUpdates` must be on for the SDK to deliver both the edit and the save events.
 */
export function LivePreview({ space, environment, entities }: { space: string; environment: string; entities: PreviewEntity[] }) {
  const { locale } = useParams<{ locale: string }>();
  // The saved values at the time the page opened: the editor's answers are compared with them, so reverting a change clears it.
  const [baseline] = useState(() => new Map(entities.map((e) => [e.id, e])));

  useEffect(() => {
    // Contentful's web app (US or EU) is the only parent that may drive the page; in development the framing page is allowed too.
    const targetOrigin = ["https://app.contentful.com", "https://app.eu.contentful.com"];
    if (process.env.NODE_ENV !== "production" && document.referrer) targetOrigin.push(new URL(document.referrer).origin);

    const secret = new URLSearchParams(window.location.search).get("cf_preview") ?? "";
    // Only the entries that are tagged on the page (the others are fetched for lookups and are not editable here).
    const tagged = new Set([...document.querySelectorAll("[data-contentful-entry-id]")].map((el) => el.getAttribute("data-contentful-entry-id")));
    const data: Entity[] = [...baseline.values()].filter((e) => tagged.has(e.id)).map((e) => ({ sys: { type: "Entry", id: e.id }, fields: { ...e.fields } }));
    // One request in flight at a time (Next runs server actions one after another anyway); while it runs, newer edits replace older
    // ones per entry, so the page catches up to the latest state in one step instead of replaying every keystroke.
    let busy = false;
    const pending = new Map<string, PreviewEdit>();
    const flush = async () => {
      if (busy || !pending.size) return;
      busy = true;
      const edits = [...pending.values()];
      pending.clear();
      try {
        await updatePreviewOverlay(secret, edits); // stores the edits and re-renders the page in the same response
      } finally {
        busy = false;
        void flush();
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = (edits: PreviewEdit[]) => {
      for (const e of edits) pending.set(e.id, e);
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 120); // typing bursts become one request
    };

    try {
      ContentfulLivePreview.init({ locale, space, environment, enableInspectorMode: true, enableLiveUpdates: true, targetOrigin });
      const unsubEdit = data.length
        ? ContentfulLivePreview.subscribe({
            data,
            locale,
            callback: (updated) => {
              const edits: PreviewEdit[] = [];
              for (const u of entitiesIn(updated)) {
                const base = baseline.get(u.sys.id);
                if (!base) continue;
                const changed: Record<string, OverlayValue> = {};
                for (const [k, raw] of Object.entries(u.fields)) {
                  const v = localized(raw, locale);
                  if (k in base.fields && isOverlayValue(v) && JSON.stringify(v) !== JSON.stringify(base.fields[k])) changed[k] = v;
                }
                edits.push({ id: base.id, locale: base.locale, fields: changed });
              }
              if (edits.length) void send(edits);
            },
          })
        : () => {};
      const unsubSave = ContentfulLivePreview.subscribe("save", {
        callback: () => {
          // Saved: the Preview API now has the values, so drop the overlays (an empty edit clears) and the draft cache, and re-render.
          pending.clear();
          const clear: PreviewEdit[] = [...baseline.values()].map((e) => ({ id: e.id, locale: e.locale, fields: {} }));
          void updatePreviewOverlay(secret, clear, true);
        },
      });
      return () => {
        clearTimeout(timer);
        unsubEdit();
        unsubSave();
      };
    } catch (e) {
      // Opened outside a supported parent (e.g. the preview URL in a bare tab): the page still renders, without click-to-edit.
      console.warn("Live Preview not started:", e instanceof Error ? e.message : e);
    }
  }, [locale, space, environment, baseline]);

  return null;
}
