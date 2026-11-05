import { describe, expect, it } from "vitest";
import { supabaseErrorMessage } from "../opportunity-form";

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
