import { Agents as ScopedOrg } from "./Agents";
import { OrgChart as CompanyOrgChart } from "./OrgChart";
import { useProjectWorkspaceEnabled } from "../hooks/useProjectWorkspaceEnabled";

export function OrgChart() {
  const { enabled, loaded } = useProjectWorkspaceEnabled();
  return enabled || !loaded ? <ScopedOrg initialView="org" /> : <CompanyOrgChart />;
}
