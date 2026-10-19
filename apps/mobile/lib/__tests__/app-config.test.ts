/**
 * The native config the voice capture needs (app.json, read by expo prebuild).
 * `npx expo prebuild -p ios --clean --no-install` turns this into the
 * Info.plist's NSMicrophoneUsageDescription.
 */
import { describe, expect, it } from "vitest";
import app from "../../app.json";

type Plugin = string | [string, Record<string, unknown>];
const plugins = app.expo.plugins as Plugin[];

describe("app.json", () => {
  it("asks for the microphone with a plain reason, and never records in the background", () => {
    const audio = plugins.find((p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === "expo-audio");
    expect(audio?.[1].microphonePermission).toMatch(/microphone/i);
    expect(audio?.[1].microphonePermission).toMatch(/deleted/i);
    expect(audio?.[1].enableBackgroundRecording).toBe(false);
  });

  it("keeps the iOS 27 scene plugin last", () => {
    expect(plugins[plugins.length - 1]).toBe("./plugins/with-ios-scene-lifecycle");
  });
});
