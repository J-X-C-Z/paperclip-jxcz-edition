import { SetupWizardNavigation, SetupWizardSidebar } from "../SetupWizard";
import { uiText } from "@/i18n";
export { SetupWizardSidebar as ChatSetupSidebar };
export function ChatSetupNavigation(props: {
  labels?: string[]; step: number; availableStep: number; disabled?: boolean; onSelect: (step: number) => void;
}) {
  return <SetupWizardNavigation {...props} labels={(props.labels ?? ["Choose agent", "Connect provider", "Try it"]).map((label) => uiText(label))} ariaLabel={uiText("Connection setup progress")} />;
}
