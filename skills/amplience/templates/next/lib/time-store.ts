/** Tiny client-side store shared by the time preview banner and the variant switcher (no server round trip per move). */
/** One stretch of time between two content changes, named after its campaign when the content says so. */
export type Segment = { from: number; label?: string };
type State = { ts: number; variants: boolean; segments: Segment[] };
let state: State = { ts: 0, variants: false, segments: [] };
const listeners = new Set<() => void>();

export const timeStore = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
