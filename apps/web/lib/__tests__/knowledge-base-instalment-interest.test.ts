import { describe, expect, it } from "vitest";
import {
  CRA_INSTALMENT_INTEREST_QUARTER,
  CRA_INSTALMENT_INTEREST_RATE,
} from "@agent-runway/core/engines/tax-optimization-engine";
import { KNOWLEDGE_BASE } from "../knowledge-base";

describe("instalment interest in the knowledge base", () => {
  it("states the engine's rate and the quarter it was checked for", () => {
    const pct = Math.round(CRA_INSTALMENT_INTEREST_RATE * 100);
    expect(KNOWLEDGE_BASE).toContain(`Interest ${pct}% (CRA ${CRA_INSTALMENT_INTEREST_QUARTER}; adjusts quarterly).`);
  });
});
