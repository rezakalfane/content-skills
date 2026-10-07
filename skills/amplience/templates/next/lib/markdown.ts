import { Marked } from "marked";
import { DEFAULT_LOCALE, type Locale } from "./i18n";

const marked = new Marked({ gfm: true, breaks: false });

/** Markdown (from Amplience `text` fields) to HTML. Site links such as `/guides` get the locale prefix. */
export function md(source: string | undefined, locale: Locale): string {
  if (!source) return "";
  const html = marked.parse(source, { async: false });
  return locale === DEFAULT_LOCALE ? html : html.replace(/href="\/(?!\/)/g, `href="/${locale}/`);
}
