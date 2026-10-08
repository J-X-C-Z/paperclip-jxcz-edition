/** Standard company title hierarchy shown when assigning an agent's position. */
export const AGENT_TITLES = ["组员", "组长", "部长", "经理"] as const;

export type AgentTitle = (typeof AGENT_TITLES)[number];

export function isStandardAgentTitle(value: string): value is AgentTitle {
  return (AGENT_TITLES as readonly string[]).includes(value);
}
