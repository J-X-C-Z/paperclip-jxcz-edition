import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { improvementTeamsApi, organizationGroupsKey } from "../api/improvementTeams";

export function useAgentOrganizationFilter(companyId: string | null | undefined) {
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  useEffect(() => { setDepartmentId(""); setTeamId(""); }, [companyId]);
  const { data } = useQuery({
    queryKey: organizationGroupsKey(companyId ?? ""),
    queryFn: () => improvementTeamsApi.list(companyId!),
    enabled: Boolean(companyId),
    retry: false,
  });

  const teams = useMemo(
    () => (data?.teams ?? []).filter((team) => !departmentId || team.departmentId === departmentId),
    [data?.teams, departmentId],
  );
  const visibleAgentIds = useMemo(() => {
    if (!departmentId && !teamId) return null;
    const ids = new Set<string>();
    const selectedTeams = (data?.teams ?? []).filter((team) =>
      (teamId ? team.id === teamId : true) && (!departmentId || team.departmentId === departmentId),
    );
    for (const team of selectedTeams) {
      for (const member of team.members) ids.add(member.agentId);
    }
    if (departmentId && !teamId) {
      const department = data?.departments?.find((entry) => entry.id === departmentId);
      if (department?.headAgentId) ids.add(department.headAgentId);
    }
    return ids;
  }, [data?.departments, data?.teams, departmentId, teamId]);

  return {
    departments: data?.departments ?? [],
    teams,
    departmentId,
    teamId,
    setDepartmentId: (value: string) => { setDepartmentId(value); setTeamId(""); },
    setTeamId,
    visibleAgentIds,
    ready: Boolean(data),
  };
}
