/**
 * Sending a queued text from the phone (lib/send-queued-text.ts): the
 * Outreach screen's Send and the dashboard's Text button both go through it.
 *
 * CASL holds the order: the server's text-check answers before iOS Messages
 * opens, and anything but a clear yes keeps Messages shut (fails closed). The
 * text goes only when the agent presses Send in Messages; the phone logs it
 * once, after Messages says it was sent. Every row is synthetic.
 */
import { describe, expect, it, vi } from "vitest";
import { sendQueuedText, textPhone, type SendQueuedTextDeps, type QueuedText } from "../send-queued-text";

const item = (over: Partial<QueuedText> = {}): QueuedText => ({
  id: "q1",
  final_body: null,
  ai_body: "Hi Sam, checking in. Reply STOP to opt out.",
  context: { purpose: "check_in", phone: "5065550101" },
  clients: { name: "Sam Lee", email: null, phone: "5065550199" },
  ...over,
});

const answer = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function deps(over: Partial<SendQueuedTextDeps> = {}) {
  const d = {
    getToken: vi.fn(async (): Promise<string | null> => "tok-1"),
    fetchFn: vi.fn(async () => answer(200, { ok: true })) as unknown as typeof fetch,
    sms: {
      isAvailableAsync: vi.fn(async () => true),
      sendSMSAsync: vi.fn(async (_to: string[], _body: string) => ({ result: "sent" })),
    },
    markTexted: vi.fn(async (_id: string, _body: string) => true),
    alert: vi.fn((_title: string, _message: string) => {}),
    dropFromQueue: vi.fn((_id: string) => {}),
    ask: vi.fn(async () => true),
    ...over,
  };
  return d;
}

describe("the consent check comes first (CASL, fails closed)", () => {
  it("a refused text-check never opens Messages and returns refused", async () => {
    const d = deps({
      fetchFn: vi.fn(async () => answer(403, { ok: false, code: "NO_CONSENT", error: "Sam opted out of texts." })) as unknown as typeof fetch,
    });

    await expect(sendQueuedText(item(), d)).resolves.toBe("refused");

    expect(d.sms.sendSMSAsync).not.toHaveBeenCalled();
    expect(d.markTexted).not.toHaveBeenCalled();
    expect(d.alert).toHaveBeenCalledWith("Call instead", "Sam opted out of texts.");
    // Consent refused: the text leaves the phone's queue.
    expect(d.dropFromQueue).toHaveBeenCalledWith("q1");
  });

  it("with no token it returns refused and asks nobody (fails closed)", async () => {
    const d = deps({ getToken: vi.fn(async () => null) });

    await expect(sendQueuedText(item(), d)).resolves.toBe("refused");

    expect(d.fetchFn).not.toHaveBeenCalled();
    expect(d.sms.sendSMSAsync).not.toHaveBeenCalled();
    expect(d.markTexted).not.toHaveBeenCalled();
    expect(d.alert).toHaveBeenCalledTimes(1);
    expect(d.dropFromQueue).not.toHaveBeenCalled();
  });

  it("no answer from the server (offline, a crash) keeps Messages shut too", async () => {
    for (const fetchFn of [
      vi.fn(async () => { throw new TypeError("Network request failed"); }),
      vi.fn(async () => answer(500, { error: "Internal server error" })),
      vi.fn(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); } })),
    ]) {
      const d = deps({ fetchFn: fetchFn as unknown as typeof fetch });
      await expect(sendQueuedText(item(), d)).resolves.toBe("refused");
      expect(d.sms.sendSMSAsync).not.toHaveBeenCalled();
      expect(d.dropFromQueue).not.toHaveBeenCalled();
    }
  });

  it("asks the server about this text, with the Bearer token", async () => {
    const d = deps();
    await sendQueuedText(item(), d);

    const [url, init] = (d.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/mobile\/outreach\/text-check$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-1" });
    expect(JSON.parse(String(init.body))).toEqual({ outreach_id: "q1" });
  });
});

describe("Messages, and logging the text once", () => {
  it("sent calls markTexted once, with the body that went", async () => {
    const d = deps();

    await expect(sendQueuedText(item({ final_body: "Edited text. Reply STOP to opt out." }), d)).resolves.toBe("sent");

    expect(d.sms.sendSMSAsync).toHaveBeenCalledWith(["5065550101"], "Edited text. Reply STOP to opt out.");
    expect(d.markTexted).toHaveBeenCalledTimes(1);
    expect(d.markTexted).toHaveBeenCalledWith("q1", "Edited text. Reply STOP to opt out.");
  });

  it("cancelled writes nothing", async () => {
    const d = deps({
      sms: { isAvailableAsync: vi.fn(async () => true), sendSMSAsync: vi.fn(async () => ({ result: "cancelled" })) },
    });

    await expect(sendQueuedText(item(), d)).resolves.toBe("cancelled");

    expect(d.markTexted).not.toHaveBeenCalled();
    expect(d.dropFromQueue).not.toHaveBeenCalled();
  });

  it("unknown asks the agent, and logs only on a yes", async () => {
    const unknown = { isAvailableAsync: vi.fn(async () => true), sendSMSAsync: vi.fn(async () => ({ result: "unknown" })) };

    const yes = deps({ sms: unknown, ask: vi.fn(async () => true) });
    await expect(sendQueuedText(item(), yes)).resolves.toBe("sent");
    expect(yes.markTexted).toHaveBeenCalledTimes(1);

    const no = deps({ sms: unknown, ask: vi.fn(async () => false) });
    await expect(sendQueuedText(item(), no)).resolves.toBe("cancelled");
    expect(no.markTexted).not.toHaveBeenCalled();
  });

  it("sent but not logged still says sent, and tells the agent", async () => {
    const d = deps({ markTexted: vi.fn(async () => false) });
    await expect(sendQueuedText(item(), d)).resolves.toBe("sent");
    expect(d.alert).toHaveBeenCalledWith("Not Logged", expect.stringContaining("Sam Lee"));
  });

  it("no number or no texting on this phone fails before any check", async () => {
    const noNumber = deps();
    await expect(sendQueuedText(item({ context: {}, clients: { name: "Sam Lee", email: null, phone: null } }), noNumber)).resolves.toBe("failed");
    expect(noNumber.fetchFn).not.toHaveBeenCalled();
    expect(noNumber.sms.sendSMSAsync).not.toHaveBeenCalled();

    const noSms = deps({ sms: { isAvailableAsync: vi.fn(async () => false), sendSMSAsync: vi.fn(async () => ({ result: "sent" })) } });
    await expect(sendQueuedText(item(), noSms)).resolves.toBe("failed");
    expect(noSms.fetchFn).not.toHaveBeenCalled();
    expect(noSms.sms.sendSMSAsync).not.toHaveBeenCalled();
  });

  it("Messages failing to open is a failure, never a send", async () => {
    const d = deps({
      sms: { isAvailableAsync: vi.fn(async () => true), sendSMSAsync: vi.fn(async () => { throw new Error("boom"); }) },
    });
    await expect(sendQueuedText(item(), d)).resolves.toBe("failed");
    expect(d.markTexted).not.toHaveBeenCalled();
  });
});

describe("textPhone", () => {
  it("is the number the text was drafted for, else the client's", () => {
    expect(textPhone(item())).toBe("5065550101");
    expect(textPhone(item({ context: { phone: "  " } }))).toBe("5065550199");
    expect(textPhone(item({ context: null, clients: null }))).toBeNull();
  });
});
