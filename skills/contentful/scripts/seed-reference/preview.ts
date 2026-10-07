"use server";

import { refresh } from "next/cache";
import { clearDraftCache, isOverlayValue, previewParams, setOverlay, type OverlayValue } from "@/lib/contentful";

export type PreviewEdit = { id: string; locale: string; fields: Record<string, OverlayValue> };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const LOCALE = /^[a-z]{2}(-[A-Za-z]{2})?$/;

/**
 * Stores the unsaved text the editor is typing, so the next render of the preview shows it. Only callable with the same preview
 * secret as the page itself (`cf_preview`), and only text, numbers, booleans, lists and rich text documents of limited size; the values are only ever read for draft requests.
 * `refresh()` re-renders the open page in this same response (one round trip). `saved` is set when the editor saved an entry: the
 * draft cache is emptied so the page reads the saved values.
 */
export async function updatePreviewOverlay(cfPreview: string, edits: PreviewEdit[], saved = false): Promise<boolean> {
  if (!previewParams({ cf_preview: cfPreview })) return false;
  for (const e of edits.slice(0, 100)) {
    if (!ID.test(e.id) || !LOCALE.test(e.locale)) continue;
    const fields: Record<string, OverlayValue> = {};
    for (const [k, v] of Object.entries(e.fields ?? {})) {
      if (FIELD.test(k) && isOverlayValue(v) && JSON.stringify(v).length <= 200_000) fields[k] = v;
    }
    setOverlay(e.id, e.locale, fields);
  }
  if (saved) clearDraftCache();
  refresh();
  return true;
}
