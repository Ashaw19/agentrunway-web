import { describe, expect, it } from "vitest";
import { isUuid, supabaseErrorMessage } from "../opportunity-form";

describe("isUuid", () => {
  it("accepts a well-formed UUID", () => {
    expect(isUuid("d8b15ce4-fd01-491c-9257-d61082d5af3f")).toBe(true);
  });

  it("accepts uppercase UUIDs", () => {
    expect(isUuid("D8B15CE4-FD01-491C-9257-D61082D5AF3F")).toBe(true);
  });

  it("rejects a human name typed into the field", () => {
    expect(isUuid("Pam Ptinis")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  it("rejects a malformed UUID (wrong segment length)", () => {
    expect(isUuid("d8b15ce4-fd01-491c-9257-d61082d5af3")).toBe(false);
  });
});

describe("supabaseErrorMessage", () => {
  it("surfaces the message from a plain postgrest-js error object (default, non-throwOnError shape)", () => {
    const err = {
      message: 'invalid input syntax for type uuid: "Pam Ptinis"',
      details: null,
      hint: null,
      code: "22P02",
    };
    expect(supabaseErrorMessage(err)).toBe('invalid input syntax for type uuid: "Pam Ptinis"');
  });

  it("surfaces the message from a real Error instance", () => {
    expect(supabaseErrorMessage(new Error("Not authenticated"))).toBe("Not authenticated");
  });

  it("falls back to the default message when there is no usable message", () => {
    expect(supabaseErrorMessage({ message: "" })).toBe("Failed to save opportunity.");
    expect(supabaseErrorMessage(null)).toBe("Failed to save opportunity.");
    expect(supabaseErrorMessage(undefined)).toBe("Failed to save opportunity.");
    expect(supabaseErrorMessage("just a string")).toBe("Failed to save opportunity.");
  });

  it("accepts a custom fallback", () => {
    expect(supabaseErrorMessage(null, "Custom fallback.")).toBe("Custom fallback.");
  });
});
