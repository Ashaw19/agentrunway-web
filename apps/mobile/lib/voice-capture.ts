/**
 * Voice capture on the phone: record a short note, have it read, confirm the
 * proposed writes, save.
 *
 *   record   expo-audio, AAC mono at 32 kbps: 3 minutes is about 0.7 MB
 *            (the transcribe route takes 10 MB)
 *   read     /api/voice-transcribe (Groq Whisper) then /api/voice-extract
 *            (Bearer token; the routes use getRequestUser)
 *   discard  the recording is deleted as soon as transcription answers,
 *            success or not. Nothing keeps the audio: not the phone, not the
 *            server (the route passes it to Groq and stores nothing)
 *   save     core applyCaptureWrites → record-writers, the writers Flight
 *            Crew's tools use; a write that can't reach the database is
 *            queued (offline-queue "captureWrite") and replayed by the same
 *            writer
 */

import { File } from "expo-file-system";
import {
  AudioQuality,
  IOSOutputFormat,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type RecordingOptions,
} from "expo-audio";
import { supabase } from "./supabase";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { applyCaptureWrites, type SaveResult } from "@agent-runway/core/lib/capture/proposals";
import type { CaptureContext, CaptureProposal, ProposedWrite } from "@agent-runway/core/lib/capture/types";
import { useDataStore } from "../stores/data-store";
import { useOfflineQueueStore } from "../stores/offline-queue";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

/** Longest note, in seconds. Recording stops by itself here. */
export const MAX_RECORDING_SECONDS = 180;
/** A press shorter than this is a tap (tap to start, tap to stop); longer is hold to talk. */
export const HOLD_THRESHOLD_MS = 450;
/** Shorter than this, there is nothing to read. */
export const MIN_RECORDING_MS = 800;

/** Speech, compressed: AAC in an .m4a, mono, 16 kHz, 32 kbps. Whisper reads it as is. */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 32000,
  },
};

export type MicPermission = "granted" | "denied" | "blocked";

/**
 * Ask for the microphone the first time; after a No, iOS won't ask again
 * ("blocked"), so the screen offers Settings instead.
 */
export async function ensureMicPermission(): Promise<MicPermission> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return "granted";
  if (!current.canAskAgain) return "blocked";
  const asked = await requestRecordingPermissionsAsync();
  if (asked.granted) return "granted";
  return asked.canAskAgain ? "denied" : "blocked";
}

/** Route audio for recording (and back for playback when done). */
export async function setRecordingMode(on: boolean): Promise<void> {
  try {
    await setAudioModeAsync({ allowsRecording: on, playsInSilentMode: true });
  } catch {
    // A failure here leaves the session as it was; recording reports its own error.
  }
}

/** Delete a recording. Never throws. */
export function deleteRecording(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or in the cache directory iOS clears on its own.
  }
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: string };
  if (res.status === 401) return "Sign in again to use voice notes.";
  if (res.status === 403) return body.error ?? "Voice notes need Pro access.";
  if (res.status === 429) return "Too many voice notes this hour. Try again in a few minutes.";
  return body.error ?? fallback;
}

/**
 * The words in a recording. The file is deleted when this returns, whether
 * it was read or not.
 */
export async function transcribeRecording(uri: string): Promise<string> {
  try {
    const token = await accessToken();
    if (!token) throw new Error("Sign in again to use voice notes.");
    const form = new FormData();
    form.append("audio", { uri, type: "audio/m4a", name: "voice-note.m4a" } as unknown as Blob);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/voice-transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch {
      throw new Error("No connection. A voice note needs a connection to be read.");
    }
    if (!res.ok) throw new Error(await errorFrom(res, "Couldn't read the recording."));
    const { transcript } = await res.json() as { transcript?: string };
    const words = (transcript ?? "").trim();
    if (!words) throw new Error("No speech was heard. Try again a little closer to the phone.");
    return words;
  } finally {
    deleteRecording(uri);
  }
}

/** The proposed writes for a note (nothing is saved). */
export async function proposeFromTranscript(transcript: string, context?: CaptureContext): Promise<CaptureProposal> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in again to use voice notes.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/voice-extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transcript, context: context?.clientId ? { clientId: context.clientId } : undefined }),
    });
  } catch {
    throw new Error("No connection. A voice note needs a connection to be read.");
  }
  if (!res.ok) throw new Error(await errorFrom(res, "Couldn't work out what to save from that note."));
  return await res.json() as CaptureProposal;
}

/** Clients a set of writes touches, for refreshing their activity lists. */
function clientIdsIn(writes: ProposedWrite[]): string[] {
  const ids = new Set<string>();
  for (const w of writes) {
    if ((w.tool === "logContactActivity" || w.tool === "createContactTask") && w.args.clientId) ids.add(w.args.clientId);
  }
  return [...ids];
}

/**
 * Save the confirmed writes. A write the database refused comes back
 * "failed" with the reason; one that couldn't reach it is queued and syncs
 * when the phone is back online. Then the data the screens show is re-read.
 */
export async function saveCapture(writes: ProposedWrite[]): Promise<SaveResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return writes.map((w) => ({ writeId: w.id, tool: w.tool, status: "failed" as const, message: "Sign in again to save." }));
  }
  const queue = useOfflineQueueStore.getState();
  const results = await applyCaptureWrites(supabase, user.id, writes, {
    today: localISODate(),
    queue: (call) => {
      queue.enqueue("captureWrite", call);
      return true;
    },
  });

  // Re-read what the screens show: lists, the clients whose activity changed.
  const store = useDataStore.getState();
  const stale = { ...store._clientActivitiesFetchedAt };
  for (const id of clientIdsIn(writes)) stale[id] = 0;
  useDataStore.setState({ _clientActivitiesFetchedAt: stale });
  if (results.some((r) => r.status === "saved")) void store.fetchAll();
  return results;
}
