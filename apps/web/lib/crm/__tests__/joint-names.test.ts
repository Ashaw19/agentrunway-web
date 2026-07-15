import { describe, expect, it } from "vitest";
import { splitJointName, isJointName } from "../joint-names";

describe("splitJointName — couples with a shared surname", () => {
  it("splits the canonical ampersand couple, inheriting the surname", () => {
    expect(splitJointName("John & Jane Smith")).toEqual(["John Smith", "Jane Smith"]);
  });

  it("splits a spelled-out 'and' couple", () => {
    expect(splitJointName("Bob and Mary Wilson")).toEqual(["Bob Wilson", "Mary Wilson"]);
  });

  it("splits a '+' couple", () => {
    expect(splitJointName("Ann + Paul Doucet")).toEqual(["Ann Doucet", "Paul Doucet"]);
  });

  it("inherits a hyphenated surname intact", () => {
    expect(splitJointName("John & Jane Smith-Jones")).toEqual([
      "John Smith-Jones",
      "Jane Smith-Jones",
    ]);
  });

  it("is case-insensitive on the 'and' conjunction", () => {
    expect(splitJointName("Bob AND Mary Wilson")).toEqual(["Bob Wilson", "Mary Wilson"]);
  });

  it("collapses messy internal whitespace before splitting", () => {
    expect(splitJointName("  John   &   Jane   Smith ")).toEqual(["John Smith", "Jane Smith"]);
  });
});

describe("splitJointName — parties with their own surnames", () => {
  it("does not force inheritance when both parties have surnames", () => {
    expect(splitJointName("John Smith & Jane Doe")).toEqual(["John Smith", "Jane Doe"]);
  });

  it("inherits only for the surname-less party in a mixed trio", () => {
    // Bob has no surname and inherits from Smith (nearest to the right);
    // Jane Doe keeps her own.
    expect(splitJointName("Bob & Jane Doe & Tim Smith")).toEqual([
      "Bob Doe",
      "Jane Doe",
      "Tim Smith",
    ]);
  });

  it("handles a three-party couple chain sharing one surname", () => {
    expect(splitJointName("John & Jane & Bob Smith")).toEqual([
      "John Smith",
      "Jane Smith",
      "Bob Smith",
    ]);
  });

  it("keeps a middle name on the surname-carrying party", () => {
    expect(splitJointName("Ann & Mary Jane Wilson")).toEqual(["Ann Wilson", "Mary Jane Wilson"]);
  });
});

describe("splitJointName — organizations must never split", () => {
  it.each([
    "Smith & Sons Realty Ltd",
    "Cox & Palmer LLP",
    "Johnson & Johnson Inc",
    "Baker & Associates",
    "Miller & Co.",
    "Hughes & Brothers Holdings",
  ])("leaves %s intact", (org) => {
    expect(splitJointName(org)).toEqual([org]);
    expect(isJointName(org)).toBe(false);
  });

  it("does not mistake a surname containing an org-like substring for an org", () => {
    // "Landry" contains "and" as a substring but is not a conjunction, and
    // contains no org marker on a word boundary.
    expect(splitJointName("Marc & Julie Landry")).toEqual(["Marc Landry", "Julie Landry"]);
  });
});

describe("splitJointName — non-joint and edge inputs", () => {
  it("returns a plain individual name unchanged", () => {
    expect(splitJointName("John Smith")).toEqual(["John Smith"]);
    expect(isJointName("John Smith")).toBe(false);
  });

  it("returns an empty array for blank input", () => {
    expect(splitJointName("")).toEqual([]);
    expect(splitJointName("   ")).toEqual([]);
  });

  it("keeps bare given names when there is no surname to inherit", () => {
    expect(splitJointName("John & Jane")).toEqual(["John", "Jane"]);
  });

  it("does not split when the conjunction has nothing to its left", () => {
    expect(splitJointName("& Smith")).toEqual(["& Smith"]);
  });

  it("preserves accented Acadian/French names through the split", () => {
    expect(splitJointName("Réjean & Céline Thériault")).toEqual([
      "Réjean Thériault",
      "Céline Thériault",
    ]);
  });

  it("preserves an apostrophe surname through the split", () => {
    expect(splitJointName("Sean & Erin O'Brien")).toEqual(["Sean O'Brien", "Erin O'Brien"]);
  });
});

describe("isJointName", () => {
  it("is true only for genuinely splittable multi-person names", () => {
    expect(isJointName("John & Jane Smith")).toBe(true);
    expect(isJointName("John Smith")).toBe(false);
    expect(isJointName("Smith & Sons Realty Ltd")).toBe(false);
  });
});
