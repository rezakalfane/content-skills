"use server";

import { CONTENT_ENV } from "@/lib/amplience";
import type { Locale } from "@/lib/i18n";
import { renderPreview } from "./render";

/**
 * Real-time preview: the browser sends the unsaved form model from the Amplience content form and gets back
 * the rendered page. Only available where content is read from virtual staging (never in production).
 */
export async function renderModel(model: unknown, locale: Locale, schema?: string) {
  if (CONTENT_ENV === "production") throw new Error("Preview is disabled in production");
  return renderPreview(model as Record<string, unknown>, locale, schema);
}

