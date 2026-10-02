// @vitest-environment jsdom

import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizardVariant } from "./OnboardingWizardVariant";

const state = vi.hoisted(() => ({ open: false, dismissed: false, path: "/ORI/departments" }));
vi.mock("../context/DialogContext", () => ({ useDialogState: () => ({ onboardingOpen: state.open, onboardingRouteDismissed: state.dismissed }) }));
vi.mock("@/lib/router", () => ({ useLocation: () => ({ pathname: state.path }) }));

const mockInstanceSettingsApi = vi.hoisted(() => ({
  getExperimental: vi.fn(),
}));

vi.mock("@/api/instanceSettings", () => ({
  instanceSettingsApi: mockInstanceSettingsApi,
}));

vi.mock("./OnboardingWizard", () => ({
  OnboardingWizard: () => <div data-testid="wizard-capsule" />,
}));

describe("OnboardingWizardVariant (PAP-138)", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  async function renderVariant() {
    root ??= createRoot(container);
    await act(async () => {
      root!.render(<OnboardingWizardVariant />);
    });
  }

  beforeEach(() => {
    state.open = false; state.dismissed = false; state.path = "/ORI/departments";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    flushSync(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the capsule wizard on demand without reading the chat flag", async () => {
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({});
    state.open = true;
    await renderVariant();

    expect(container.querySelector('[data-testid="wizard-capsule"]')).not.toBeNull();
    expect(mockInstanceSettingsApi.getExperimental).not.toHaveBeenCalled();
  });
  it("keeps the wizard unloaded on ordinary pages", async () => {
    await renderVariant();
    expect(container.querySelector('[data-testid="wizard-capsule"]')).toBeNull();
  });

  it("supports prefixed onboarding routes and retains state after closing", async () => {
    state.path = "/ORI/onboarding";
    await renderVariant();
    const wizard = container.querySelector('[data-testid="wizard-capsule"]');
    expect(wizard).not.toBeNull();
    state.path = "/ORI/departments";
    await renderVariant();
    expect(container.querySelector('[data-testid="wizard-capsule"]')).toBe(wizard);
  });

  it("does not load a dismissed route-driven wizard", async () => {
    state.path = "/onboarding";
    state.dismissed = true;
    await renderVariant();
    expect(container.querySelector('[data-testid="wizard-capsule"]')).toBeNull();
  });

});
