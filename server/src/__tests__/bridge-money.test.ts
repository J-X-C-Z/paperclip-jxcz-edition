import { describe, expect, it } from "vitest";
import { settleUsdMicros, utcAccountingMonth } from "../services/bridge-money.js";

describe("Bridge micro-USD accounting", () => {
  it("carries sub-cent charges without dropping their total", () => {
    let residual = "0";
    let cents = 0;
    for (let i = 0; i < 100; i += 1) {
      const result = settleUsdMicros(residual, "100");
      residual = result.residualMicros;
      cents += result.costCents;
    }
    expect(cents).toBe(1);
    expect(residual).toBe("0");
  });

  it("uses half-toward-positive-infinity and supports signed corrections", () => {
    expect(settleUsdMicros("0", "5000")).toEqual({ costCents: 1, residualMicros: "-5000" });
    expect(settleUsdMicros("0", "-15000")).toEqual({ costCents: -1, residualMicros: "-5000" });
  });

  it("keeps carries isolated to the UTC accounting month", () => {
    expect(utcAccountingMonth(new Date("2026-03-01T00:30:00+02:00"))).toBe("2026-02");
  });
});
