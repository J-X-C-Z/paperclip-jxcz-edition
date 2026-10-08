import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { briefs } from "./schema/briefs.js";

describe("archived brief authorship", () => {
  it("retains the historical name when the author agent is deleted", () => {
    const config = getTableConfig(briefs);
    const author = config.columns.find((column) => column.name === "author_agent_id");
    const name = config.columns.find((column) => column.name === "author_agent_name");
    const reference = config.foreignKeys.find((key) => key.reference().columns.includes(briefs.authorAgentId));
    expect(author?.notNull).toBe(false);
    expect(reference?.onDelete).toBe("set null");
    expect(name?.notNull).toBe(true);
  });
});
