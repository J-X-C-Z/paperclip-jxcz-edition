import { describe, expect, it } from "vitest";
import { findUIAdapter } from "../registry";

describe("MiMo ACP transcript", () => {
  it("uses the built-in ACP parser for assistant deltas rather than process output", () => {
    const adapter = findUIAdapter("mimocode_local");
    expect(adapter).not.toBeNull();
    expect(adapter!.parseStdoutLine(JSON.stringify({ type: "acpx.text_delta", text: "Verified result" }), "now"))
      .toEqual([{ kind: "assistant", ts: "now", text: "Verified result", delta: true }]);
  });
});
