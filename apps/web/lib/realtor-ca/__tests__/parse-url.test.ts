import { describe, expect, it } from "vitest";
import { parseRealtorCaUrl } from "../parse-url";

describe("parseRealtorCaUrl", () => {
  it("accepts standard www URL", () => {
    expect(
      parseRealtorCaUrl(
        "https://www.realtor.ca/real-estate/27254789/123-main-street",
      ),
    ).toEqual({ ok: true, listingId: "27254789" });
  });

  it("accepts non-www URL", () => {
    expect(
      parseRealtorCaUrl(
        "https://realtor.ca/real-estate/27254789/123-main-street",
      ),
    ).toEqual({ ok: true, listingId: "27254789" });
  });

  it("accepts French URL", () => {
    expect(
      parseRealtorCaUrl(
        "https://www.realtor.ca/fr/immobilier/27254789/123-rue-principale",
      ),
    ).toEqual({ ok: true, listingId: "27254789" });
  });

  it("trims leading and trailing whitespace", () => {
    expect(
      parseRealtorCaUrl(
        "  https://www.realtor.ca/real-estate/27254789/x  ",
      ),
    ).toEqual({ ok: true, listingId: "27254789" });
  });

  it("rejects empty string", () => {
    expect(parseRealtorCaUrl("")).toEqual({
      ok: false,
      reason: "invalid_url",
    });
  });

  it("rejects plain text that isn't a URL", () => {
    expect(parseRealtorCaUrl("hello world")).toEqual({
      ok: false,
      reason: "invalid_url",
    });
  });

  it("rejects non-realtor.ca hosts", () => {
    expect(
      parseRealtorCaUrl("https://example.com/real-estate/27254789/x"),
    ).toEqual({ ok: false, reason: "invalid_url" });
  });

  it("rejects realtor.ca homepage with no listing path", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/")).toEqual({
      ok: false,
      reason: "not_a_listing",
    });
  });

  it("rejects realtor.ca map URL", () => {
    expect(
      parseRealtorCaUrl("https://www.realtor.ca/map#zoom=12"),
    ).toEqual({ ok: false, reason: "not_a_listing" });
  });

  it("rejects realtor.ca agent page", () => {
    expect(
      parseRealtorCaUrl("https://www.realtor.ca/agents/some-agent-slug"),
    ).toEqual({ ok: false, reason: "not_a_listing" });
  });

  it("is case-insensitive on the path segment", () => {
    expect(
      parseRealtorCaUrl(
        "https://www.realtor.ca/Real-Estate/27254789/x",
      ),
    ).toEqual({ ok: true, listingId: "27254789" });
  });
});
