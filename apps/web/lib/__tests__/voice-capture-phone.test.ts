/**
 * The iPhone voice capture (2026-10-18), held to its rules from here: the
 * phone has no test runner, and this file must not import phone code (the
 * web build typechecks tests and Vercel installs web deps only), so the
 * phone source is read as text.
 *
 *   - audio: AAC mono, small, 3 minutes at most, deleted once transcribed
 *   - microphone permission string set through the expo-audio config plugin
 *   - saves through core applyCaptureWrites (the Flight Crew tools' writers),
 *     and the offline replay through the same writer
 *   - both voice routes take the phone's Bearer token (getRequestUser)
 *   - the button is on the Clients list, the Deals list and the client profile
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");

describe("phone audio", () => {
  const lib = read("apps/mobile/lib/voice-capture.ts");

  it("records compressed speech, well under the transcribe route's 10 MB", () => {
    const rate = Number(lib.match(/bitRate: (\d+)/)?.[1]);
    const seconds = Number(lib.match(/MAX_RECORDING_SECONDS = (\d+)/)?.[1]);
    expect(lib).toMatch(/extension: "\.m4a"/);
    expect(lib).toMatch(/numberOfChannels: 1/);
    expect(seconds).toBe(180);
    // 3 minutes at 32 kbps is about 0.7 MB.
    expect((rate / 8) * seconds).toBeLessThan(1024 * 1024);
    const route = read("apps/web/app/api/voice-transcribe/route.ts");
    expect(route).toMatch(/const MAX_AUDIO_BYTES = 10 \* 1024 \* 1024/);
  });

  it("deletes the recording when transcription answers, read or not", () => {
    expect(lib).toMatch(/export async function transcribeRecording[\s\S]*?\} finally \{\s*deleteRecording\(uri\);\s*\}/);
    const button = read("apps/mobile/components/voice/VoiceCaptureButton.tsx");
    // A too-short or abandoned recording is deleted too.
    expect(button.match(/deleteRecording\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("asks for the microphone with a plain reason, and handles a No", () => {
    const app = JSON.parse(read("apps/mobile/app.json")) as { expo: { plugins: unknown[] } };
    const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-audio") as [string, Record<string, unknown>] | undefined;
    expect(plugin?.[1].microphonePermission).toMatch(/microphone/i);
    expect(plugin?.[1].enableBackgroundRecording).toBe(false);
    // The iOS 27 scene plugin stays last.
    expect(app.expo.plugins.at(-1)).toBe("./plugins/with-ios-scene-lifecycle");
    const button = read("apps/mobile/components/voice/VoiceCaptureButton.tsx");
    expect(button).toContain("Linking.openSettings()");
    expect(lib).toMatch(/canAskAgain/);
  });
});

describe("phone saves through the shared writers", () => {
  it("the confirm card saves with core applyCaptureWrites and queues offline writes", () => {
    const lib = read("apps/mobile/lib/voice-capture.ts");
    expect(lib).toContain('from "@agent-runway/core/lib/capture/proposals"');
    expect(lib).toMatch(/applyCaptureWrites\(supabase, user\.id, writes, \{/);
    expect(lib).toMatch(/queue\.enqueue\("captureWrite", call\)/);
    expect(lib).not.toMatch(/\.from\("(contact_activities|contact_tasks|mileage_logs|receipt_expenses|pipeline_deals|clients|transactions)"\)/);
  });

  it("the offline replay runs the same writer", () => {
    const queue = read("apps/mobile/stores/offline-queue.ts");
    expect(queue).toContain('case "captureWrite"');
    expect(queue).toMatch(/applyCaptureWrite\(supabase, user\.id, mutation\.payload as CaptureWriteCall/);
  });

  it("Cancel saves nothing: only Confirm calls saveCapture", () => {
    const card = read("apps/mobile/components/voice/VoiceCaptureCard.tsx");
    expect(card.match(/saveCapture\(/g)?.length).toBe(1);
    expect(card).toMatch(/const confirm = async \(\) => \{[\s\S]*?saveCapture\(pending\)/);
  });
});

describe("routes both apps call", () => {
  it.each(["apps/web/app/api/voice-transcribe/route.ts", "apps/web/app/api/voice-extract/route.ts"])("%s takes the Bearer token", (rel) => {
    const route = read(rel);
    expect(route).toContain("await getRequestUser(req)");
    expect(route).not.toContain("authenticateRequest");
    expect(route).not.toMatch(/supabase\.auth\.getUser\(\)/);
  });

  it("Whisper is asked for English, with a note on where French goes", () => {
    const route = read("apps/web/app/api/voice-transcribe/route.ts");
    expect(route).toMatch(/language: "en"/);
    expect(route).toMatch(/French/);
  });
});

describe("where the button is", () => {
  it("on the Clients list, the client profile (with that client as context) and the Deals list", () => {
    const clients = read("apps/mobile/app/(app)/clients.tsx");
    const deals = read("apps/mobile/app/(app)/deals.tsx");
    expect(clients).toMatch(/<VoiceCaptureButton onProposal=\{setCapture\} \/>/);
    expect(clients).toMatch(/<VoiceCaptureButton\s+variant="inline"\s+context=\{\{ clientId: client\.id, clientName: client\.name \}\}/);
    expect(deals).toMatch(/<VoiceCaptureButton onProposal=\{setCapture\} \/>/);
  });

  it("the profile shows its card in place, not a second sheet over the first", () => {
    const clients = read("apps/mobile/app/(app)/clients.tsx");
    expect(clients).toMatch(/voiceProposal \? \(\s*\/\* ── Voice note review/);
  });
});
