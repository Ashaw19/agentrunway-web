"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

interface AiChatCtx {
  /** Whether the AI chat panel is open */
  isOpen: boolean;
  /** Open or close the AI chat panel */
  setOpen: (open: boolean) => void;
  /** Pending question to auto-send when chat opens */
  pendingQuestion: string | null;
  /** Open chat and auto-send a question */
  askQuestion: (question: string) => void;
  /** Consume (read + clear) the pending question — called by AiChat component */
  consumeQuestion: () => string | null;
}

const Ctx = createContext<AiChatCtx>({
  isOpen: false,
  setOpen: () => {},
  pendingQuestion: null,
  askQuestion: () => {},
  consumeQuestion: () => null,
});

export function AiChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const questionRef = useRef<string | null>(null);

  const askQuestion = useCallback((q: string) => {
    questionRef.current = q;
    setPendingQuestion(q);
    setOpen(true);
  }, []);

  const consumeQuestion = useCallback((): string | null => {
    const q = questionRef.current;
    if (q) {
      questionRef.current = null;
      setPendingQuestion(null);
    }
    return q;
  }, []);

  return (
    <Ctx value={{ isOpen, setOpen, pendingQuestion, askQuestion, consumeQuestion }}>
      {children}
    </Ctx>
  );
}

export const useAiChat = () => useContext(Ctx);
