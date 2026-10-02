import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "./locales";
import { i18n, uiText } from ".";

afterEach(async () => { await i18n.changeLanguage("en"); });

describe("interface translations", () => {
  it("defaults the interface to Simplified Chinese", () => {
    expect(DEFAULT_LOCALE).toBe("zh-CN");
  });

  it("uses consistent Chinese product terms and translates navigation and recovery labels", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(uiText("Agents")).toBe("智能体");
    expect(uiText("Costs")).toBe("成本");
    expect(uiText("Routines")).toBe("例程");
    expect(uiText("Page section")).toBe("页面分区");
    expect(uiText("Quick filters")).toBe("快速筛选");
    expect(uiText("Search")).toBe("搜索");
    expect(uiText("Open account menu")).toBe("打开账户菜单");
    expect(uiText("In review")).toBe("待验收");
    expect(uiText("gpt-6-luna")).toBe("gpt-6-luna");
    expect(uiText("Custom project name")).toBe("Custom project name");
  });
  it("retains English and unknown values when the selected language is English", async () => {
    await i18n.changeLanguage("en");
    expect(uiText("Agents")).toBe("Agents");
    expect(uiText("Open account menu")).toBe("Open account menu");
  });
});
