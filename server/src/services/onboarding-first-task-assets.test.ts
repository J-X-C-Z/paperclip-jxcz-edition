import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  ONBOARDING_FIRST_TASK_OPENING_INTERVIEW_OPTION_ID,
  ONBOARDING_FIRST_TASK_OPENING_QUESTION_ID,
  ONBOARDING_FIRST_TASK_OPENING_TASK_OPTION_ID,
  buildOnboardingFirstTaskBrief,
  buildOnboardingFirstTaskOpeningQuestion,
  buildOnboardingFirstAgentInstructionsBundle,
  fillFirstTaskPlaceholders,
  renderChiefOfStaffPersona,
  renderOnboardingFirstTaskGreeting,
} from "./onboarding-first-task-assets.js";

describe("fillFirstTaskPlaceholders", () => {
  it("fills the name and organization when present", () => {
    const out = fillFirstTaskPlaceholders(
      "I'm {{agentName}}, chief of staff for {{organizationName}}.",
      { agentName: "Ada", organizationName: "Acme" },
    );
    expect(out).toBe("I'm Ada, chief of staff for Acme.");
  });

  it("drops the name and its trailing separator when no name is set", () => {
    const out = fillFirstTaskPlaceholders("I'm {{agentName}}, your first agent teammate.", {
      agentName: null,
    });
    expect(out).toBe("I'm your first agent teammate.");
  });

  it("falls back to a generic organization label when missing", () => {
    const out = fillFirstTaskPlaceholders("for {{organizationName}}.", {});
    expect(out).toBe("for your organization.");
  });
});

describe("renderOnboardingFirstTaskGreeting", () => {
  it("renders the board-approved greeting with the agent name", async () => {
    const greeting = await renderOnboardingFirstTaskGreeting({ agentName: "Ada" });
    expect(greeting).toBe("欢迎使用 Paperclip！我是 Ada，你的首位智能体队友。选择你想采用的开始方式，接下来交给我处理。");
  });

  it.each([null, "   "])("omits a missing agent name cleanly (%s)", async (agentName) => {
    const greeting = await renderOnboardingFirstTaskGreeting({ agentName });
    expect(greeting).toBe("欢迎使用 Paperclip！我是你的首位智能体队友。选择你想采用的开始方式，接下来交给我处理。");
  });
});

describe("buildOnboardingFirstTaskOpeningQuestion", () => {
  it("builds the two-option opening card with a free-text task option", async () => {
    const payload = await buildOnboardingFirstTaskOpeningQuestion();
    expect(payload.version).toBe(1);
    expect(payload.supersedeOnUserComment).toBe(true);
    expect(payload.submitLabel).toBe("继续");
    expect(payload.questions).toHaveLength(1);
    const [question] = payload.questions;
    expect(question.id).toBe(ONBOARDING_FIRST_TASK_OPENING_QUESTION_ID);
    expect(question.selectionMode).toBe("single");
    expect(question.required).toBe(true);
    expect(question.prompt).toBe("你想从哪里开始？");
    expect(question.options.map((option) => option.id)).toEqual([
      ONBOARDING_FIRST_TASK_OPENING_INTERVIEW_OPTION_ID,
      ONBOARDING_FIRST_TASK_OPENING_TASK_OPTION_ID,
    ]);
    expect(question.options[0].label).toBe(
      "采访我，并提出计划和执行计划的智能体团队。",
    );
    expect(question.options[0].freeText).toBeUndefined();
    expect(question.options[1].label).toBe("我有一个任务想做");
    expect(question.options[1].freeText).toBe(true);
  });
});

describe("buildOnboardingFirstTaskBrief", () => {
  it.each([
    { usePlanProposal: false, mode: "confirmation" },
    { usePlanProposal: true, mode: "plan" },
  ])("invokes the skill with $mode mode without inlining the policy", async ({ usePlanProposal, mode }) => {
    const brief = await buildOnboardingFirstTaskBrief({ usePlanProposal });
    expect(brief).toContain("请在此引导任务中使用 `first-task` 技能（/first-task）");
    expect(brief).toContain("请阅读并遵循其 SKILL.md");
    expect(brief).toContain("包括此任务后续被唤醒时");
    expect(brief).toContain(`单任务提案模式：\`${mode}\`。`);
    expect(brief).not.toContain("{{");
    expect(brief).not.toContain("Take the path the user picked.");
    expect(brief).not.toContain("request_confirmation");
    expect(brief).not.toContain("request_checkbox_confirmation");
  });
});

describe("first-task proposal mode policy", () => {
  it("maps both persisted brief modes to their proposal forms", async () => {
    const skill = await readFile(new URL("../onboarding-assets/first-task/skills/first-task/SKILL.md", import.meta.url), "utf8");
    expect(skill).toContain("`confirmation` 表示发布一张描述子任务的 `request_confirmation`");
    expect(skill).toContain("`plan` 表示保存一份描述同一子任务的简短 `plan` 文档");
    expect(skill).toContain("指向其已保存版本的 `request_checkbox_confirmation` 卡片");
    expect(skill).toContain("无论单任务提案模式是什么，用户明确要求计划时都适用此规则");
  });
});

describe("chief-of-staff persona", () => {
  it("renders the persona with placeholders filled", async () => {
    const persona = await renderChiefOfStaffPersona({
      agentName: "Ada",
      organizationName: "Acme",
    });
    expect(persona).toContain("你是 Acme 的幕僚长 Ada。");
    expect(persona).toContain("# 与用户协作");
    expect(persona).not.toContain("{{agentName}}");
    expect(persona).not.toContain("{{organizationName}}");
  });

  it("returns an AGENTS.md-keyed bundle for the first agent", async () => {
    const bundle = await buildOnboardingFirstAgentInstructionsBundle({
      agentName: "Ada",
      organizationName: "Acme",
    });
    expect(bundle.entryFile).toBe("AGENTS.md");
    expect(bundle.files).toEqual({
      "AGENTS.md": await renderChiefOfStaffPersona({ agentName: "Ada", organizationName: "Acme" }),
    });
  });
});
