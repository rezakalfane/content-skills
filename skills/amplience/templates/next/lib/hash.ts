/** Small stable string hash (FNV-1a, 32 bit) for change detection; not for security. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const sig = (value: unknown) => hash(JSON.stringify(value) ?? "");
