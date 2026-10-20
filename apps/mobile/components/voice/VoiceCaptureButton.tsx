/**
 * VoiceCaptureButton — record a voice note after a showing or a call.
 *
 * Hold to talk (release to stop), or tap to start and tap again to stop.
 * Stops by itself at 3 minutes. The recording is sent to be transcribed,
 * deleted from the phone, and the note is read into proposed writes, which
 * the parent shows on the confirm card (VoiceCaptureCard). Nothing is saved
 * until the agent taps Confirm there.
 *
 * `floating`: the round button on the Clients and Deals lists.
 * `inline`: the full-width "Voice note" row on a client's profile, which
 * passes that client as context ("she" is that client).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioRecorder } from "expo-audio";
import type { CaptureContext, CaptureProposal } from "@agent-runway/core/lib/capture/types";
import {
  HOLD_THRESHOLD_MS,
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_MS,
  VOICE_RECORDING_OPTIONS,
  deleteRecording,
  ensureMicPermission,
  proposeFromTranscript,
  setRecordingMode,
  transcribeRecording,
} from "@/lib/voice-capture";
import { useColors, shadows, useTheme, Space, Radius, Type } from "@/lib/theme";

type Phase = "idle" | "starting" | "recording" | "reading";

interface Props {
  onProposal: (proposal: CaptureProposal) => void;
  context?: CaptureContext;
  variant?: "floating" | "inline";
  /** True while recording or reading the note (the "+" sheet stays open meanwhile). */
  onBusyChange?: (busy: boolean) => void;
}

const fmtElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function VoiceCaptureButton({ onProposal, context, variant = "floating", onBusyChange }: Props) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);

  const [phase, setPhaseState] = useState<Phase>("idle");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "hint" } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [toggleMode, setToggleMode] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const pressStartedAt = useRef(0);
  const startedAt = useRef(0);
  /** Released or tapped again before the recorder was ready: stop as soon as it is. */
  const stopWhenReady = useRef(false);
  const holdDecided = useRef(false);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; cap?: ReturnType<typeof setTimeout> }>({});

  const setPhase = (p: Phase) => {
    const wasBusy = phaseRef.current !== "idle";
    phaseRef.current = p;
    setPhaseState(p);
    if (wasBusy !== (p !== "idle")) onBusyChange?.(p !== "idle");
  };

  const clearTimers = () => {
    if (timers.current.tick) clearInterval(timers.current.tick);
    if (timers.current.cap) clearTimeout(timers.current.cap);
    timers.current = {};
  };

  // A message clears itself.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.tone === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [message]);

  /** Stop and throw the recording away (left the app, or unmounted). */
  const abandon = useCallback(async (why: string | null) => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "starting") return;
    clearTimers();
    try { await recorder.stop(); } catch { /* not recording */ }
    deleteRecording(recorder.uri);
    await setRecordingMode(false);
    setPhase("idle");
    setToggleMode(false);
    if (why) setMessage({ text: why, tone: "error" });
  }, [recorder]);

  useEffect(() => {
    // "background" only: the microphone permission prompt and Control Center
    // make the app "inactive" for a moment without leaving it.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") void abandon("Recording stopped when you left the app. Nothing was saved.");
    });
    return () => {
      sub.remove();
      void abandon(null);
    };
  }, [abandon]);

  const finish = useCallback(async () => {
    if (phaseRef.current === "starting") {
      stopWhenReady.current = true;
      return;
    }
    if (phaseRef.current !== "recording") return;
    clearTimers();
    setToggleMode(false);
    const length = Date.now() - startedAt.current;
    try { await recorder.stop(); } catch { /* already stopped at the 3-minute mark */ }
    const uri = recorder.uri;
    await setRecordingMode(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!uri || length < MIN_RECORDING_MS) {
      deleteRecording(uri);
      setPhase("idle");
      setMessage({ text: "Hold to talk, or tap once to start and again to stop.", tone: "hint" });
      return;
    }

    setPhase("reading");
    try {
      const transcript = await transcribeRecording(uri); // deletes the file
      const proposal = await proposeFromTranscript(transcript, context);
      setPhase("idle");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onProposal(proposal);
    } catch (err) {
      setPhase("idle");
      setMessage({ text: err instanceof Error ? err.message : "Couldn't read that note.", tone: "error" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [context, onProposal, recorder]);

  const start = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    setMessage(null);
    stopWhenReady.current = false;
    setPhase("starting");
    const permission = await ensureMicPermission().catch(() => "denied" as const);
    if (permission !== "granted") {
      setPhase("idle");
      if (permission === "blocked") {
        Alert.alert(
          "Microphone is off",
          "Agent Runway needs the microphone for voice notes. Turn it on in Settings → Agent Runway → Microphone. You can still add notes by typing.",
          [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => void Linking.openSettings() }],
        );
      } else {
        setMessage({ text: "Voice notes need the microphone. Nothing was recorded.", tone: "error" });
      }
      return;
    }
    try {
      await setRecordingMode(true);
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_RECORDING_SECONDS });
    } catch {
      await setRecordingMode(false);
      setPhase("idle");
      setMessage({ text: "Couldn't start recording. Try again.", tone: "error" });
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    timers.current.tick = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    timers.current.cap = setTimeout(() => void finish(), MAX_RECORDING_SECONDS * 1000);
    if (stopWhenReady.current) {
      stopWhenReady.current = false;
      void finish();
    }
  }, [finish, recorder]);

  const onPressIn = () => {
    if (phaseRef.current === "idle") {
      pressStartedAt.current = Date.now();
      holdDecided.current = false;
      void start();
    } else if (phaseRef.current === "recording" && toggleMode) {
      void finish();
    }
  };

  const onPressOut = () => {
    if (holdDecided.current) return;
    if (phaseRef.current !== "recording" && phaseRef.current !== "starting") return;
    holdDecided.current = true;
    const held = Date.now() - pressStartedAt.current;
    if (held >= HOLD_THRESHOLD_MS) {
      void finish(); // hold to talk: released
    } else {
      setToggleMode(true); // a tap: keep recording until the next tap
    }
  };

  const recording = phase === "recording" || phase === "starting";
  const reading = phase === "reading";
  const label = reading
    ? "Reading your note…"
    : recording
      ? `${fmtElapsed(elapsed)} · ${toggleMode ? "tap to stop" : "release to stop"}`
      : variant === "inline" ? "Voice note" : null;
  const a11y = recording ? "Stop recording" : "Record a voice note";

  if (variant === "inline") {
    return (
      <View style={{ gap: Space.xs }}>
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={reading}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint="Hold to talk, or tap to start and tap again to stop. You review everything before it is saved."
          style={({ pressed }) => [
            styles.inline,
            {
              backgroundColor: recording ? c.danger : c.primaryDim,
              borderColor: recording ? c.danger : c.primaryBorder,
              opacity: pressed && !recording ? 0.8 : 1,
            },
          ]}
        >
          {reading ? <ActivityIndicator color={c.primary} /> : <Ionicons name={recording ? "stop" : "mic"} size={18} color={recording ? "#fff" : c.primary} />}
          <Text style={[Type.bodyBold, { color: recording ? "#fff" : c.primary }]}>{label}</Text>
        </Pressable>
        {message && (
          <Text style={[Type.caption, { color: message.tone === "error" ? c.danger : c.textDim }]}>{message.text}</Text>
        )}
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.floatWrap}>
      {(label || message) && (
        <View style={[styles.bubble, { backgroundColor: c.bgElevated, borderColor: c.cardBorder, ...sh.card }]}>
          <Text style={[Type.caption, { color: message?.tone === "error" && !label ? c.danger : c.text }]}>
            {label ?? message?.text}
          </Text>
        </View>
      )}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={reading}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Hold to talk, or tap to start and tap again to stop. You review everything before it is saved."
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: recording ? c.danger : c.primary, transform: [{ scale: recording ? 1.12 : pressed ? 0.96 : 1 }], ...sh.card },
        ]}
      >
        {reading ? <ActivityIndicator color="#fff" /> : <Ionicons name={recording ? "stop" : "mic"} size={26} color="#fff" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  floatWrap: {
    position: "absolute",
    right: Space.xl,
    bottom: Space.xl,
    alignItems: "flex-end",
    gap: Space.sm,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: 260,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
