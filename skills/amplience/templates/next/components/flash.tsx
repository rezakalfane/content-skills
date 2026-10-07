import type { ReactNode } from "react";
import { getTimePreview } from "@/lib/amplience";
import { sig } from "@/lib/hash";
import { ChangeFlash } from "./change-flash";

/**
 * Wraps an area (`id` identifies it across time states) so it blinks when its `value` changes while time traveling;
 * renders as-is otherwise (and in production).
 */
export async function Flash({ id, value, children }: { id: string; value: unknown; children: ReactNode }) {
  if (!(await getTimePreview())) return <>{children}</>;
  return (
    <ChangeFlash id={id} sig={sig(value)}>
      {children}
    </ChangeFlash>
  );
}
