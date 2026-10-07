/**
 * Global next/image loader. Amplience images use Dynamic Imaging (resize + auto format on the CDN);
 * everything else (BigCommerce, local files) goes through Next's own optimizer, as the default loader would.
 */
export default function loader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  const q = quality ?? 75;
  if (/^https:\/\/[^/]*media\.amplience\.net\/i\//.test(src)) {
    return `${src}?w=${width}&q=${q}&fmt=auto&upscale=false`;
  }
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${q}`;
}
