import { describe, expect, it } from "vitest";
import { renderOnboardingGreeting } from "./onboarding-greeting.js";

describe("renderOnboardingGreeting", () => {
  it("introduces the agent by name as the user's first teammate", async () => {
    const greeting = await renderOnboardingGreeting({
      agentName: "Nova",
      organizationName: "Acme",
    });

    expect(greeting).toBe("欢迎使用 Paperclip！我是 Nova，你的首位智能体队友。选择你想采用的开始方式，接下来交给我处理。");
  });

  it("drops the name gracefully when no agent name is set", async () => {
    const greeting = await renderOnboardingGreeting({
      agentName: null,
      organizationName: "Acme",
    });

    expect(greeting).toBe("欢迎使用 Paperclip！我是你的首位智能体队友。选择你想采用的开始方式，接下来交给我处理。");
  });

  it("trims whitespace/blank names to the no-name phrasing", async () => {
    const greeting = await renderOnboardingGreeting({ agentName: "   " });

    expect(greeting).toBe("欢迎使用 Paperclip！我是你的首位智能体队友。选择你想采用的开始方式，接下来交给我处理。");
  });
});
