import Image from "next/image";
import Link from "next/link";
import { CategoryTiles } from "@/components/category-tiles";
import { FaqItem } from "@/components/faq-list";
import { GuideCard } from "@/components/guide-card";
import { Hero } from "@/components/hero";
import { Flash } from "@/components/flash";
import { PostGrid } from "@/components/post-card";
import { SpotlightCard } from "@/components/spotlight-card";
import { getBcProducts } from "@/lib/bigcommerce";
import { getGuides, getPosts, type Block, type Faq } from "@/lib/content";
import { getMessages, localePath, topicLabel, type Locale } from "@/lib/i18n";

type Feature = Extract<Block, { type: "feature" }>;

type Props = {
  blocks: Block[];
  locale: Locale;
  /** Path of the page being rendered (search forms post back to it). */
  path?: string;
  /** Search text from the URL (`?q=`), used by the post listing. */
  q?: string;
  /** Time preview: render the lists as they are at this instant (see components/time-variants.tsx). */
  at?: number;
};

/** Renders the components stacked in a Page, top to bottom. Consecutive feature blocks share one band. */
export async function PageBlocks({ blocks, locale, path = "/", q = "", at }: Props) {
  const groups: (Block | Feature[])[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.type === "feature" && Array.isArray(last)) last.push(b);
    else groups.push(b.type === "feature" ? [b] : b);
  }
  // Keys follow the kind of block (not its position), so a block that appears or disappears does not make its
  // neighbours look changed while time traveling.
  const seen: Record<string, number> = {};
  const keyOf = (g: Block | Feature[]) => {
    const kind = Array.isArray(g) ? "features" : g.type;
    return `${kind}#${(seen[kind] = (seen[kind] ?? -1) + 1)}`;
  };
  return (
    <>
      {groups.map((g) => {
        const id = keyOf(g);
        return (
          <Flash key={id} id={id} value={g}>
            {Array.isArray(g) ? <FeatureBand blocks={g} /> : <BlockView block={g} locale={locale} path={path} q={q} at={at} />}
          </Flash>
        );
      })}
    </>
  );
}

function FeatureBand({ blocks }: { blocks: Feature[] }) {
  return (
    <section className="band section">
      <div className="page space-y-16 md:space-y-24">
        {blocks.map((b, i) => (
          <div
            key={i}
            className={`grid items-center gap-8 md:grid-cols-2 md:gap-14 ${b.layout === "image_right" ? "md:[&>*:first-child]:order-2" : ""}`}
          >
            {b.image && (
              <div className="overflow-hidden rounded-[4px] bg-line">
                <Image src={b.image.url} alt={b.image.alt} width={1200} height={800} className="aspect-[3/2] w-full object-cover" />
              </div>
            )}
            <div>
              <h2 className="text-[2rem]">{b.title}</h2>
              <div className="rte mt-4 text-slate" dangerouslySetInnerHTML={{ __html: b.html }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function BlockView({ block, locale, path, q, at }: { block: Block; locale: Locale; path: string; q: string; at?: number }) {
  const t = getMessages(locale);
  switch (block.type) {
    case "hero":
      return (
        <Hero
          hero={block.hero}
          locale={locale}
          secondaryCta={block.hero.variant === "home" ? { label: t.allProducts, href: "/products" } : undefined}
        />
      );

    case "text":
      return (
        <div className="page pb-4 pt-8">
          <div className="rte text-lg text-slate" dangerouslySetInnerHTML={{ __html: block.html }} />
        </div>
      );

    case "image":
      return (
        <section className="page section">
          <Image src={block.img.url} alt={block.img.alt} width={1600} height={900} className="w-full rounded-[4px]" />
        </section>
      );

    case "video":
      return (
        <section className="page section">
          <video controls className="w-full rounded-[4px]" src={block.src} aria-label={block.title} />
        </section>
      );

    case "categories":
      return (
        <section className="page section">
          <h2 className="mb-8">{block.title ?? t.shopByCategory}</h2>
          <CategoryTiles locale={locale} />
        </section>
      );

    case "spotlights": {
      if (!block.items.length) return null;
      const products = await getBcProducts(block.items.map((s) => s.bcProductId), locale);
      return (
        <section className="page section">
          <h2 className="mb-8">{block.title ?? t.tradeFavourites}</h2>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {block.items.map((s) => (
              <SpotlightCard key={s.id} item={s} product={products.get(s.bcProductId)} locale={locale} />
            ))}
          </div>
        </section>
      );
    }

    case "guides":
      if (!block.items.length) return null;
      return (
        <section className="band section">
          <div className="page">
            <div className="mb-8 flex items-end justify-between gap-6">
              <h2>{block.title ?? t.fromGuides}</h2>
              <Link href={localePath(locale, "/guides")} className="hidden font-semibold underline decoration-amber decoration-2 underline-offset-4 sm:block">
                {block.linkLabel ?? t.buyingGuides}
              </Link>
            </div>
            <div className="grid gap-x-8 gap-y-10 md:grid-cols-3">
              {block.items.map((g) => (
                <GuideCard key={g.id} guide={g} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      );

    case "posts":
      return block.items.length ? (
        <section className="page section">
          <h2 className="mb-8">{block.title ?? t.allArticles}</h2>
          <PostGrid posts={block.items} locale={locale} />
        </section>
      ) : null;

    case "postListing": {
      const all = await getPosts(locale, at);
      const needle = q.trim().toLowerCase();
      const posts = needle ? all.filter((p) => `${p.title} ${p.description ?? ""}`.toLowerCase().includes(needle)) : all;
      return (
        <section className="page section space-y-10">
          <form action={localePath(locale, path)} className="flex max-w-xl gap-3">
            <input name="q" defaultValue={q} aria-label={t.search} placeholder={block.searchPlaceholder ?? t.searchPlaceholder} className="field flex-1" />
            <button className="btn btn-primary">{block.searchButtonLabel ?? t.search}</button>
          </form>
          <div>
            <h2 className="mb-8">
              {needle ? `${posts.length} ${posts.length === 1 ? t.result : t.results} ${t.resultsFor} “${q}”` : (block.title ?? t.allArticles)}
            </h2>
            <PostGrid posts={posts} locale={locale} />
          </div>
        </section>
      );
    }

    case "guideListing": {
      const guides = await getGuides(locale, at);
      return (
        <section className="page section">
          <div className="grid gap-x-8 gap-y-12 md:grid-cols-3">
            {guides.map((g) => (
              <GuideCard key={g.id} guide={g} locale={locale} />
            ))}
          </div>
        </section>
      );
    }

    case "faqs": {
      // Keep topics in the order they first appear (items are sorted by sort order).
      const topics = [...new Set(block.items.map((f: Faq) => f.topic))];
      return (
        <section className="page section space-y-14">
          {topics.map((topic) => (
            <div key={topic} className="grid gap-4 border-t border-line pt-8 lg:grid-cols-[15rem_1fr] lg:gap-14">
              <h2 className="text-[1.6rem]">{topicLabel(locale, topic)}</h2>
              <div>
                {block.items
                  .filter((f) => f.topic === topic)
                  .map((f) => (
                    <FaqItem key={f.id} faq={f} />
                  ))}
              </div>
            </div>
          ))}
        </section>
      );
    }

  }
}
