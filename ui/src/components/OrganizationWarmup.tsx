import { useEffect } from "react";
import { usePrefetchQuery } from "@tanstack/react-query";
import { improvementTeamsApi, organizationGroupsKey } from "../api/improvementTeams";
import { useCompany } from "../context/CompanyContext";

/** Prepare the organization workspace after the current company is authorized. */
export function OrganizationWarmup() {
  const { selectedCompanyId, selectedCompany, loading, error } = useCompany();
  if (loading || error || !selectedCompanyId || selectedCompany?.id !== selectedCompanyId) return null;
  return <CompanyOrganizationWarmup key={selectedCompanyId} companyId={selectedCompanyId} />;
}

function CompanyOrganizationWarmup({ companyId }: { companyId: string }) {
  usePrefetchQuery({
    queryKey: organizationGroupsKey(companyId),
    queryFn: () => improvementTeamsApi.list(companyId),
    staleTime: 30_000,
    retry: false,
  });
  useEffect(() => {
    // Prime the lightweight route module too, while the current page stays visible.
    void import("../pages/Departments").catch(() => {});
  }, []);
  return null;
}
