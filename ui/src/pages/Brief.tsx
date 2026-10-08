import { useEffect } from "react";
import { FileText } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useOptionalProjectScope } from "@/context/ProjectScopeContext";
import { BriefWorkspace } from "@/components/BriefWorkspace";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";

export function Brief() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const scope = useOptionalProjectScope();
  useEffect(() => setBreadcrumbs([{ label: "简报" }]), [setBreadcrumbs]);
  if (!selectedCompanyId) return <EmptyState icon={FileText} message="选择公司以查看简报。" />;
  if (scope?.error) return <p role="alert" className="text-sm text-destructive">{scope.error.message}</p>;
  if (scope?.loading) return <PageSkeleton variant="list" />;
  const projectId = scope?.enabled ? scope.projectId : null;
  return <BriefWorkspace key={`${selectedCompanyId}:${projectId ?? "all"}`} companyId={selectedCompanyId} projectId={projectId} />;
}
