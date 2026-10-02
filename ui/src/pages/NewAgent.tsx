import { useEffect } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { NewAgentSetup } from "../components/new-agent/NewAgentSetup";
import { useUiTranslator } from "@/i18n";

export function NewAgent() {
  const tr = useUiTranslator();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([
      { label: tr("Agents"), href: "/agents" },
      { label: tr("New agent") },
    ]);
  }, [setBreadcrumbs, tr]);
  return <NewAgentSetup />;
}
