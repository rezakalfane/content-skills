import { notFound } from "next/navigation";
import { AMP_LOCALES, CONTENT_ENV, DELIVERY_HOST } from "@/lib/amplience";
import { VSE_HOST } from "@/lib/vse";
import type { Locale } from "@/lib/i18n";
import { RealtimePreview } from "./realtime-preview";
import { renderPreview } from "./render";

/**
 * Amplience visualization entry point. Dynamic Content opens it with:
 *   /preview?id={{content.sys.id}}&vse={{vse.domain}}&locales={{locales}}[&realtime=true]
 * The saved version of the item is read from virtual staging; with `realtime=true` the client then follows the
 * content form (unsaved edits). Only served where content comes from virtual staging, never on production.
 */
export const dynamic = "force-dynamic";


export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (CONTENT_ENV === "production") notFound();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const id = one(sp.id);
  const vse = one(sp.vse) ?? DELIVERY_HOST;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !(VSE_HOST.test(vse) || vse === DELIVERY_HOST)) notFound();

  const locale: Locale = one(sp.locales)?.toLowerCase().startsWith("fr") ? "fr" : "en";
  const res = await fetch(`https://${vse}/content/id/${id}?depth=all&format=inlined&locale=${AMP_LOCALES[locale]}`, { cache: "no-store" });
  if (!res.ok) notFound();
  const { content } = (await res.json()) as { content: Record<string, unknown> };
  const schema = (content._meta as { schema?: string } | undefined)?.schema;
  const initial = await renderPreview(content, locale, schema);

  return one(sp.realtime) === "true" ? <RealtimePreview initial={initial} initialLocale={locale} schema={schema} /> : initial;
}
