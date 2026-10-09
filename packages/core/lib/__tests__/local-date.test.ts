import { describe, expect, it } from "vitest";
import { addDaysISO, atlanticISODate, localISODate } from "../local-date";

describe("atlanticISODate", () => {
  it("is still today in Atlantic time after 8 pm, when UTC has rolled over (ADT, UTC-3)", () => {
    // 2026-10-09 21:30 ADT
    expect(atlanticISODate(new Date("2026-10-10T00:30:00Z"))).toBe("2026-10-09");
    // 2026-10-09 23:59 ADT
    expect(atlanticISODate(new Date("2026-10-10T02:59:00Z"))).toBe("2026-10-09");
    // 2026-10-10 00:00 ADT
    expect(atlanticISODate(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-10");
  });

  it("follows standard time in winter (AST, UTC-4), including the year boundary", () => {
    expect(atlanticISODate(new Date("2027-01-01T03:59:00Z"))).toBe("2026-12-31");
    expect(atlanticISODate(new Date("2027-01-01T04:00:00Z"))).toBe("2027-01-01");
  });

  it("matches the UTC day during the Atlantic daytime", () => {
    expect(atlanticISODate(new Date("2026-07-19T12:00:00Z"))).toBe("2026-07-19");
  });
});

describe("localISODate", () => {
  it("agrees with the local getters on the same Date, whatever the host zone", () => {
    for (const iso of ["2026-10-10T00:30:00Z", "2027-01-01T03:59:00Z", "2026-03-08T06:30:00Z"]) {
      const d = new Date(iso);
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      expect(localISODate(d)).toBe(expected);
    }
  });

  it("round-trips a noon-anchored date-only value", () => {
    expect(localISODate(new Date("2026-03-01T12:00:00"))).toBe("2026-03-01");
  });
});

describe("addDaysISO", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDaysISO("2026-10-09", 14)).toBe("2026-10-23");
    expect(addDaysISO("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDaysISO("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysISO("2026-01-05", -14)).toBe("2025-12-22");
  });

  it("is unaffected by DST transitions", () => {
    // Atlantic DST ends 2026-11-01 and starts 2027-03-14.
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysISO("2027-03-13", 1)).toBe("2027-03-14");
  });
});
