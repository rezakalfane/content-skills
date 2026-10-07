import { GuideView } from "@/components/guide-view";
import { PageBlocks } from "@/components/page-blocks";
import { PostView } from "@/components/post-view";
import { AMP_LOCALES } from "@/lib/amplience";
import { previewable } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import { resolveLocalized } from "@/lib/localized";

type Model = Record<string, unknown>;

/**
 * The Delivery API wraps an item as `{ content: {...} }`; the visualization SDK may hand over either shape, and its
 * root can lack `_meta.schema`. Unwrap, and fall back to the schema of the saved item the preview was opened with.
 */
function rootOf(model: Model, schema?: string): Model {
  const inner = model.content;
  const root = (!model._meta && inner && typeof inner === "object" ? inner : model) as Model;
  const meta = (root._meta ?? {}) as Model;
  return meta.schema || !schema ? root : { ...root, _meta: { ...meta, schema } };
}

/** Renders any delivered / form-model content item the way the live site would. */
export async function renderPreview(model: Model, locale: Locale, schema?: string) {
  const flat = resolveLocalized(rootOf(model, schema), AMP_LOCALES[locale].split(",")) as Model;
  const p = previewable(flat, locale);
  if (!p) {
    return (
      <div className="page py-16 text-slate">
        <p>This content type has no preview. Open a Page, blog post, buying guide or page component.</p>
        <p className="mt-3 text-sm">
          Received: <code>{String((flat._meta as Model | undefined)?.schema ?? "no schema")}</code>, fields{" "}
          <code>{Object.keys(flat).join(", ") || "none"}</code>
        </p>
      </div>
    );
  }
  switch (p.kind) {
    case "page":
      return <PageBlocks blocks={p.page.blocks} locale={locale} path="/preview" />;
    case "blocks":
      return <PageBlocks blocks={p.blocks} locale={locale} path="/preview" />;
    case "post":
      return <PostView post={p.post} locale={locale} />;
    case "guide":
      return <GuideView guide={p.guide} locale={locale} />;
  }
}
