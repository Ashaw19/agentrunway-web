"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VoiceClientDraft } from "@/app/api/voice-extract/route";

// Re-export the type so consumers can import it from here
export type { VoiceClientDraft };

type VoiceState = "idle" | "recording" | "transcribing" | "extracting" | "error";

interface Props {
  onDraft: (draft: VoiceClientDraft) => void;
}

const MAX_RECORDING_MS = 60_000; // 60 seconds

export function VoiceClientButton({ onDraft }: Props) {
  const [state, setState]           = useState<VoiceState>("idle");
  const [errorMsg, setErrorMsg]     = useState<string>("");

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const autoStopTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear error and reset to idle after 3 seconds
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
    // ── Step 1: Transcribe ─────────────────────────────────────────────────
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
      if (!transcript) throw new Error("No speech detected — please try again.");
    } catch (err) {
      handleError(err instanceof Error ? err.message : "Transcription failed");
      return;
    }

    // ── Step 2: Extract client info ────────────────────────────────────────
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

      const draft = await res.json() as VoiceClientDraft;
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

    recorder.start(250); // collect chunks every 250ms
    setState("recording");

    // Auto-stop after max duration
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const isLoading = state === "transcribing" || state === "extracting";
  const isRecording = state === "recording";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={isRecording ? "destructive" : "outline"}
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "gap-1.5",
          isRecording && "relative",
        )}
      >
        {/* Pulsing ring while recording */}
        {isRecording && (
          <span className="absolute inset-0 rounded-md animate-ping bg-destructive/30 pointer-events-none" />
        )}

        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}

        {isLoading
          ? state === "transcribing" ? "Transcribing…" : "Extracting…"
          : isRecording
            ? "Stop"
            : "Voice"}
      </Button>

      {/* Error message */}
      {state === "error" && errorMsg && (
        <p className="text-[11px] text-destructive max-w-[180px] text-right leading-tight">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
