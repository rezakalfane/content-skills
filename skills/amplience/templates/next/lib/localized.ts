/**
 * The visualization SDK hands over the unsaved form model. Depending on the field it can still carry
 * `{ values: [{ locale, value }] }` wrappers, which the Delivery API would have flattened for us.
 * This resolves them the same way (first matching locale wins, so `fr-FR,en-US` falls back to English).
 */
export function resolveLocalized(node: unknown, locales: string[]): unknown {
  if (Array.isArray(node)) return node.map((n) => resolveLocalized(n, locales));
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const values = o.values;
    if (Array.isArray(values) && values.every((v) => v && typeof v === "object" && "locale" in v && "value" in v)) {
      const list = values as { locale: string; value: unknown }[];
      for (const l of locales) {
        const hit = list.find((v) => v.locale.toLowerCase() === l.toLowerCase());
        if (hit) return resolveLocalized(hit.value, locales);
      }
      return list.length ? resolveLocalized(list[0].value, locales) : undefined;
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolveLocalized(v, locales)]));
  }
  return node;
}
