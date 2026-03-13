"use client";

/**
 * VoiceRecordButton — global voice recording widget used inside QuickAddFab.
 *
 * State machine: idle → recording → transcribing → extracting → idle/error
 *
 * Records audio via MediaRecorder, transcribes via Groq Whisper,
 * extracts structured data via Llama 3.3 (multi-intent), then
 * passes the VoiceDraft to the onDraft callback.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceDraft } from "@/lib/voice/types";

export type VoiceState = "idle" | "recording" | "transcribing" | "extracting" | "error";

interface Props {
  onDraft: (draft: VoiceDraft) => void;
  /** Called when state changes — allows parent to react to recording/processing */
  onStateChange?: (state: VoiceState) => void;
}

const MAX_RECORDING_MS = 60_000; // 60 seconds

export function VoiceRecordButton({ onDraft, onStateChange }: Props) {
  const [state, setState]       = useState<VoiceState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Auto-clear errors after 3 seconds
  useEffect(() => {
    if (state !== "error") return;
    const t = setTimeout(() => {
      setState("idle");
      setErrorMsg("");
    }, 3000);
    return () => clearTimeout(t);
  }, [state]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      mediaRecorderRef.current?.stop();
    };
  }, []);

  const handleError = useCallback((msg: string) => {
    setState("error");
    setErrorMsg(msg);
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    // ── Step 1: Transcribe ───────────────────────────────────────────────
    setState("transcribing");

    let transcript: string;
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const res = await fetch("/api/voice-transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Transcription failed (${res.status})`);
      }

      const data = await res.json() as { transcript: string };
      transcript = data.transcript?.trim();
      if (!transcript) throw new Error("No speech detected — try again.");
    } catch (err) {
      handleError(err instanceof Error ? err.message : "Transcription failed");
      return;
    }

    // ── Step 2: Classify intent + extract ────────────────────────────────
    setState("extracting");

    try {
      const res = await fetch("/api/voice-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Extraction failed (${res.status})`);
      }

      const draft = await res.json() as VoiceDraft;
      setState("idle");
      onDraft(draft);
    } catch (err) {
      handleError(err instanceof Error ? err.message : "Extraction failed");
    }
  }, [handleError, onDraft]);

  const stopRecording = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (state !== "idle") return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      handleError("Microphone access denied");
      return;
    }

    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const audioBlob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      void processAudio(audioBlob);
    };

    recorder.start(250);
    setState("recording");

    autoStopTimerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_MS);
  }, [state, handleError, processAudio, stopRecording]);

  const handleClick = () => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      void startRecording();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const isLoading   = state === "transcribing" || state === "extracting";
  const isRecording = state === "recording";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-150 text-white",
          isRecording
            ? "bg-red-600 hover:bg-red-500"
            : isLoading
              ? "bg-slate-600 cursor-wait"
              : "bg-rose-600 hover:bg-rose-500",
        )}
        title={
          isLoading
            ? state === "transcribing" ? "Transcribing..." : "Extracting..."
            : isRecording
              ? "Stop recording"
              : "Voice input"
        }
      >
        {/* Pulsing ring while recording */}
        {isRecording && (
          <span className="absolute inset-0 rounded-full animate-ping bg-red-500/40 pointer-events-none" />
        )}

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {/* Status label */}
      <span className={cn(
        "rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-medium shadow-lg border border-white/10 backdrop-blur-sm whitespace-nowrap",
        state === "error" ? "text-red-400" : "text-white",
      )}>
        {state === "error"
          ? errorMsg || "Error"
          : isLoading
            ? state === "transcribing" ? "Transcribing..." : "Extracting..."
            : isRecording
              ? "Listening... tap to stop"
              : "Voice Input"}
      </span>
    </div>
  );
}
