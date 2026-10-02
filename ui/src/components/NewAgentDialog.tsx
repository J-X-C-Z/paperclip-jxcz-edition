import type { AgentTemplate } from "@paperclipai/shared";
import { AgentTemplateSelection } from "./new-agent/AgentTemplateSelection";
import { useState } from "react";
import { useCompany } from "../context/CompanyContext";
import { ExternalAgentInviteDialog } from "./new-agent/ExternalAgentInviteDialog";
import { useNavigate } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { AgentBasicsDialog } from "./new-agent/AgentBasicsDialog";

export function NewAgentDialog() {
  const { newAgentOpen, closeNewAgent } = useDialog();
  const { selectedCompanyId } = useCompany();
  if (!newAgentOpen) return null;
  return <NewAgentDialogContent key={selectedCompanyId} companyId={selectedCompanyId} onClose={closeNewAgent} />;
}

function NewAgentDialogContent({ companyId, onClose }: { companyId: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [invite, setInvite] = useState(false);
  const [template, setTemplate] = useState<AgentTemplate | null>(null);
  if (invite && companyId) return <ExternalAgentInviteDialog companyId={companyId} onClose={onClose} onBack={() => setInvite(false)} />;
  if (!template && companyId) return <AgentTemplateSelection companyId={companyId} onClose={onClose} onSelect={setTemplate} />;
  return (
    <AgentBasicsDialog
      open
      onClose={onClose}
      onInvite={companyId ? () => setInvite(true) : undefined}
      onContinue={(basics) => {
        onClose();
        navigate(`/agents/new?${new URLSearchParams({ ...basics, ...(template ? { templateId: template.id } : {}) })}`);
      }}
    />
  );
}
