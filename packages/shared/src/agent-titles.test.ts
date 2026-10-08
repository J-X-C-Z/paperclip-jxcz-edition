import { describe, expect, it } from "vitest";
import { AGENT_TITLES, isStandardAgentTitle } from "./agent-titles.js";

describe("agent titles", () => {
  it("provides the standard hierarchy in order while allowing legacy custom titles", () => {
    expect(AGENT_TITLES).toEqual(["组员", "组长", "部长", "经理"]);
    expect(isStandardAgentTitle("组长")).toBe(true);
    expect(isStandardAgentTitle("工程师")).toBe(false);
  });
});
