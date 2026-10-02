import { lazy } from "react";
import { useLocation } from "@/lib/router";
import { isOnboardingPath } from "../lib/onboarding-route";
import { useDialogState } from "../context/DialogContext";
import { DeferredMount } from "./DeferredMount";
import { PaperclipLoading } from "./AnimatedPaperclipIcon";

const OnboardingWizard = lazy(() => import("./OnboardingWizard").then(m => ({ default: m.OnboardingWizard })));

/**
 * Default onboarding wizard. Conference-room chat is now the only surface left
 * behind `enableConferenceRoomChat`; onboarding stays available without that
 * experimental flag.
 */
export function OnboardingWizardVariant() {
  const { onboardingOpen, onboardingRouteDismissed } = useDialogState();
  const { pathname } = useLocation();
  const active = onboardingOpen || (isOnboardingPath(pathname) && !onboardingRouteDismissed);
  return <DeferredMount active={active} fallback={<PaperclipLoading />}><OnboardingWizard /></DeferredMount>;
}
