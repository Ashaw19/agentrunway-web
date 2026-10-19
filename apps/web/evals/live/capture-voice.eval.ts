/**
 * EVAL (live model): a voice note keeps the agent's own words.
 *
 * Synthetic notes go through the real extractor (lib/voice/capture.ts:
 * extractCapture, the pinned fast model and the prompt in
 * lib/voice/extract-prompt.ts). A note spoken as "...said I will be invited
 * to her wedding" was saved as "...said the agent will be invited"
 * (2026-10-19). Binary checks per note: the cleaned transcript and every
 * activity or note summary keep the speaker's "I", "me" or "my", and none
 * calls the speaker "the agent" or "the realtor".
 *
 * Skips without ANTHROPIC_API_KEY.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractCapture } from "@/lib/voice/capture";
import { setAIRunRecorderForTests } from "@/lib/ai/run-ledger";
import { LIVE, LIVE_SKIP_NOTE } from "../fixtures/live";

const TODAY = "2026-10-18"; // Sunday

interface VoiceNote {
  name: string;
  transcript: string;
  /** The profile the note was recorded on, if any. */
  contextClientName?: string;
  /** Words from the speaker's point of view that every summary keeps. */
  keeps: RegExp;
}

/** Synthetic notes and names only. */
const NOTES: VoiceNote[] = [
  {
    name: "a note on a client's profile",
    transcript: "Dana indicated that I will be invited to her wedding.",
    contextClientName: "Dana Whitfield",
    keeps: /\bI will be invited\b/i,
  },
  {
    name: "a call with a promise",
    transcript: "Called Sarah Mills, um, I told her I'd send the comps tomorrow morning.",
    keeps: /\bI\b/,
  },
  {
    name: "a showing with 'my'",
    transcript: "Showed the Lees 40 Pine Ave today, they said my listing photos were the best they've seen.",
    keeps: /\bmy\b/i,
  },
];

const THIRD_PERSON = /\bthe (agent|realtor)\b/i;

describe.skipIf(!LIVE)(`EVAL live: ${NOTES.length} voice notes keep the agent's own words${LIVE_SKIP_NOTE}`, () => {
  beforeAll(() => setAIRunRecorderForTests(() => {}));
  afterAll(() => setAIRunRecorderForTests(null));

  it.each(NOTES)("$name", async (n) => {
    const out = await extractCapture(n.transcript, { userId: "eval-user", today: TODAY, contextClientName: n.contextClientName, feature: "eval" });
    const summaries = out.intents.flatMap((i) => (i.intent === "log_activity" || i.intent === "note" ? [i.summary] : []));
    expect(summaries.length).toBeGreaterThan(0);
    expect({
      transcriptKeeps: n.keeps.test(out.transcriptCleaned),
      transcriptThirdPerson: THIRD_PERSON.test(out.transcriptCleaned),
      summariesKeep: summaries.some((s) => n.keeps.test(s)),
      summariesThirdPerson: summaries.filter((s) => THIRD_PERSON.test(s)),
    }).toEqual({ transcriptKeeps: true, transcriptThirdPerson: false, summariesKeep: true, summariesThirdPerson: [] });
  });
});
