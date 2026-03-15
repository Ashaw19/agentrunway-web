"use client";

/**
 * VoiceDraftProvider — React context that ferries a voice draft
 * from the global QuickAddFab to whatever page needs to consume it.
 *
 * Flow:
 *   1. FAB records audio → transcribes → extracts → setDraft(draft)
 *   2. FAB navigates to the target page (e.g. /transactions?voice=1)
 *   3. Target page calls consume() on mount → gets the draft + clears it
 *   4. Target page pre-fills its dialog from the draft
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { VoiceDraft } from "./types";

interface VoiceDraftCtx {
  /** Current pending draft (null if none) */
  draft: VoiceDraft | null;
  /** Set a new draft (called by FAB after extraction) */
  setDraft: (d: VoiceDraft | null) => void;
  /** Read the draft and clear it in one call (called by consuming page) */
  consume: () => VoiceDraft | null;
}

const Ctx = createContext<VoiceDraftCtx>({
  draft: null,
  setDraft: () => {},
  consume: () => null,
});

export function VoiceDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  // Use a ref alongside state so consume() always gets the latest value
  // even when called inside a useEffect that captured a stale closure.
  const draftRef = useRef<VoiceDraft | null>(null);

  const setDraftBoth = useCallback((d: VoiceDraft | null) => {
    draftRef.current = d;
    setDraft(d);
  }, []);

  const consume = useCallback((): VoiceDraft | null => {
    const d = draftRef.current;
    if (d) {
      draftRef.current = null;
      setDraft(null);
    }
    return d;
  }, []);

  return (
    <Ctx value={{ draft, setDraft: setDraftBoth, consume }}>
      {children}
    </Ctx>
  );
}

export const useVoiceDraft = () => useContext(Ctx);
