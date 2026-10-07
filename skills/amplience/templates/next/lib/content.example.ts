import { getByKey, imageOf, keyRequest, listBySchema, listRequest, type RawImage } from "./amplience";
import type { Locale } from "./i18n";
import { md } from "./markdown";

// ---------------------------------------------------------------- types (what components render)
export type Img = { url: string; alt: string };
export type Cta = { label?: string; href?: string };

export type Hero = { title: string; description?: string; image?: Img; secondImage?: Img; cta?: Cta; variant: "default" | "home" };
export type Author = { name: string; avatar?: Img; bio?: string };

export type PostBlock = { type: "text"; html: string } | { type: "image"; img: Img } | { type: "video"; title: string; src: string };
export type Post = {
  id: string;
  url: string;
  title: string;
  description?: string;
  date?: string;
  readTime?: number;
  image?: Img;
  authors: Author[];
  blocks: PostBlock[];
};

export type Faq = { id: string; question: string; answerHtml: string; topic: string; sortOrder: number; featured: boolean };

export type Guide = {
  id: string;
  url: string;
  title: string;
  summary: string;
  image?: Img;
  audience?: string;
  readMinutes?: number;
  sortOrder: number;
  steps: { title: string; body: string; proTip?: string }[];
  checklist: string[];
  recommendedProducts: { bcProductId: number; sku?: string }[];
  relatedFaqs: Faq[];
  author?: Author;
};

export type Spotlight = {
  id: string;
  title: string;
  bcProductId: number;
  bcSku?: string;
  tagline: string;
  badge?: string;
  image?: Img;
  featured: boolean;
  keyFeatures: string[];
  useCases: { title: string; description?: string }[];
};

export type Navigation = {
  headerLinks: { label: string; href: string; highlight?: boolean }[];
  footerColumns: { heading: string; links: { label: string; href: string }[] }[];
  contact?: { salesEmail?: string; supportPhone?: string; openingHours?: string };
  legalText?: string;
  announcements: Announcement[];
};

export type Announcement = {
  message: string;
  cta?: Cta;
  style: "info" | "promo" | "warning";
  audience: "everyone" | "logged_in" | "guests";
};

/** The components an editor can stack in a Page, in render order. */
export type Block =
  | { type: "hero"; hero: Hero; campaign?: string }
  | { type: "text"; html: string }
  | { type: "image"; img: Img }
  | { type: "video"; title: string; src: string }
  | { type: "feature"; title: string; html: string; image?: Img; layout: "image_left" | "image_right" }
  | { type: "categories"; title?: string }
  | { type: "spotlights"; title?: string; items: Spotlight[] }
  | { type: "guides"; title?: string; linkLabel?: string; items: Guide[] }
  | { type: "posts"; title?: string; items: Post[] }
  | { type: "postListing"; title?: string; searchPlaceholder?: string; searchButtonLabel?: string }
  | { type: "guideListing"; title?: string }
  | { type: "faqs"; items: Faq[] };

export type Page = { title: string; description?: string; blocks: Block[] };

// ---------------------------------------------------------------- raw delivery shapes (loosely typed, mapped below)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;
const schemaName = (r: Raw) => String(r?._meta?.schema ?? "").split("/").pop() ?? "";
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && x._meta) : []);
const img = (r?: Raw) => imageOf(r as RawImage | undefined);
const urlOf = (r: Raw) => `/${r._meta?.deliveryKey ?? ""}`;

const author = (r: Raw): Author => ({ name: r.name, avatar: img(r.avatar), bio: r.bio });

const video = (r: Raw) => {
  const l = r.video ?? {};
  return { title: r.videotitle ?? "", src: `https://cdn.media.amplience.net/v/${l.endpoint}/${encodeURIComponent(l.name)}/mp4_720p` };
};

function post(r: Raw, locale: Locale): Post {
  return {
    id: r._meta.deliveryId,
    url: urlOf(r),
    title: r.title,
    description: r.description,
    date: r.date,
    readTime: r.readTime,
    image: img(r.image),
    authors: list(r.authors).map(author),
    blocks: list(r.content).flatMap((c): PostBlock[] => {
      const s = schemaName(c);
      if (s === "text") return [{ type: "text", html: md(c.text, locale) }];
      if (s === "image") return img(c) ? [{ type: "image", img: img(c)! }] : [];
      if (s === "video") return [{ type: "video", ...video(c) }];
      return [];
    }),
  };
}

const faq = (r: Raw, locale: Locale): Faq => ({
  id: r._meta.deliveryId,
  question: r.question,
  answerHtml: md(r.answer, locale),
  topic: r.topic,
  sortOrder: r.sortOrder ?? 0,
  featured: Boolean(r.featured),
});

const guide = (r: Raw, locale: Locale): Guide => ({
  id: r._meta.deliveryId,
  url: urlOf(r),
  title: r.title,
  summary: r.summary,
  image: img(r.image),
  audience: r.audience,
  readMinutes: r.readMinutes,
  sortOrder: r.sortOrder ?? 0,
  steps: (r.steps ?? []).map((s: Raw) => ({ title: s.title, body: s.body, proTip: s.proTip })),
  checklist: r.checklist ?? [],
  recommendedProducts: r.recommendedProducts ?? [],
  relatedFaqs: list(r.relatedFaqs).map((f) => faq(f, locale)),
  author: r.author?._meta ? author(r.author) : undefined,
});

const spotlight = (r: Raw): Spotlight => ({
  id: r._meta.deliveryId,
  title: r.title,
  bcProductId: r.bcProductId,
  bcSku: r.bcSku,
  tagline: r.tagline,
  badge: r.badge,
  image: img(r.image),
  featured: Boolean(r.featured),
  keyFeatures: r.keyFeatures ?? [],
  useCases: r.useCases ?? [],
});

const hero = (r: Raw): Hero => ({
  title: r.title,
  description: r.description,
  image: img(r.image),
  secondImage: img(r.secondImage),
  cta: r.cta,
  variant: r.variant === "home" ? "home" : "default",
});

function block(c: Raw, locale: Locale): Block[] {
  switch (schemaName(c)) {
    case "hero-banner":
      return [{ type: "hero", hero: hero(c) }];
    case "hero-slot": {
      // A slot holds whatever hero is scheduled to be live (empty when nothing is).
      const live = list(c.slotContent)[0];
      return live ? [{ type: "hero", hero: hero(live), campaign: c.campaign }] : [];
    }
    case "text":
      return [{ type: "text", html: md(c.text, locale) }];
    case "image":
      return img(c) ? [{ type: "image", img: img(c)! }] : [];
    case "video":
      return [{ type: "video", ...video(c) }];
    case "feature-block":
      return [{ type: "feature", title: c.title, html: md(c.copy, locale), image: img(c.image), layout: c.layout ?? "image_left" }];
    case "category-tiles":
      return [{ type: "categories", title: c.title }];
    case "spotlight-row":
      return [{ type: "spotlights", title: c.title, items: list(c.spotlights).map(spotlight) }];
    case "guide-row":
      return [{ type: "guides", title: c.title, linkLabel: c.linkLabel, items: list(c.guides).map((g) => guide(g, locale)) }];
    case "post-grid":
      return [{ type: "posts", title: c.title, items: list(c.posts).map((p) => post(p, locale)) }];
    case "post-listing":
      return [{ type: "postListing", title: c.title, searchPlaceholder: c.searchPlaceholder, searchButtonLabel: c.searchButtonLabel }];
    case "guide-listing":
      return [{ type: "guideListing", title: c.title }];
    case "faq-section":
      return [{ type: "faqs", items: list(c.faqs).map((f) => faq(f, locale)).sort((a, b) => a.sortOrder - b.sortOrder) }];
    default:
      return [];
  }
}

const page = (r: Raw, locale: Locale): Page => ({
  title: r.title,
  description: r.description,
  blocks: list(r.components).flatMap((c) => block(c, locale)),
});

/** Name of the stretch of time a Page is in: the campaign of its scheduled slot, else the title of its first hero. */
export const pageLabel = (page?: Page) => {
  const hero = page?.blocks.find((b) => b.type === "hero");
  return hero?.type === "hero" ? (hero.campaign ?? hero.hero.title) : undefined;
};

/** What a delivered (or form-model) item renders as; used by the visualization preview. */
export type Previewable =
  | { kind: "page"; page: Page }
  | { kind: "post"; post: Post }
  | { kind: "guide"; guide: Guide }
  | { kind: "blocks"; blocks: Block[] };

export function previewable(r: Raw, locale: Locale): Previewable | undefined {
  switch (schemaName(r)) {
    case "page":
      return { kind: "page", page: page(r, locale) };
    case "blogpost":
      return { kind: "post", post: post(r, locale) };
    case "buying-guide":
      return { kind: "guide", guide: guide(r, locale) };
    default: {
      const blocks = block(r, locale);
      return blocks.length ? { kind: "blocks", blocks } : undefined;
    }
  }
}

// ---------------------------------------------------------------- queries
/** A Page by delivery key: `home`, `faq`, `guides`, `blog`, or any page an editor adds. */
export async function getPage(key: string, locale: Locale, at?: number): Promise<Page | undefined> {
  const r = await getByKey<Raw>(key, locale, at);
  return r && schemaName(r) === "page" ? page(r, locale) : undefined;
}

export async function getNavigation(locale: Locale): Promise<Navigation | undefined> {
  const r = await getByKey<Raw>("site/navigation", locale);
  if (!r) return undefined;
  return {
    headerLinks: r.headerLinks ?? [],
    footerColumns: r.footerColumns ?? [],
    contact: r.contact,
    legalText: r.legalText,
    announcements: list(r.announcements) as Announcement[],
  };
}

/** First announcement aimed at this audience. */
export async function getAnnouncement(locale: Locale, audience: "guests" | "logged_in" = "guests") {
  const nav = await getNavigation(locale);
  return nav?.announcements.find((a) => a.audience === "everyone" || a.audience === audience);
}

const BLOG_FILTER = { schema: "blogpost", where: { "/account": "Commerce B2B" }, sort: "DESC" } as const;
const GUIDE_FILTER = { schema: "buying-guide" } as const;

export async function getPosts(locale: Locale, at?: number) {
  return (await listBySchema<Raw>(BLOG_FILTER, locale, at)).map((r) => post(r, locale));
}

export async function getPost(slug: string, locale: Locale, at?: number) {
  const r = await getByKey<Raw>(`blog/${slug}`, locale, at);
  return r && schemaName(r) === "blogpost" ? post(r, locale) : undefined;
}

export async function getGuides(locale: Locale, at?: number) {
  const all = await listBySchema<Raw>(GUIDE_FILTER, locale, at);
  return all.map((r) => guide(r, locale)).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getGuide(slug: string, locale: Locale, at?: number) {
  const r = await getByKey<Raw>(`guides/${slug}`, locale, at);
  return r && schemaName(r) === "buying-guide" ? guide(r, locale) : undefined;
}

export async function getSpotlights(locale: Locale) {
  return (await listBySchema<Raw>({ schema: "product-spotlight" }, locale)).map(spotlight);
}


/**
 * Every request a typical visit makes (navigation, the main pages, the post and guide lists), in the form the time travel timeline
 * stores them under. `/api/warm` registers them so the timeline is built before anyone asks for it.
 */
export function warmRequests(): string[] {
  const pages = ["site/navigation", "home", "faq", "guides", "blog"];
  return [
    ...pages.map((k) => keyRequest(k, "en")),
    ...["site/navigation", "home"].map((k) => keyRequest(k, "fr")),
    listRequest(BLOG_FILTER, "en"),
    listRequest(GUIDE_FILTER, "en"),
  ];
}
