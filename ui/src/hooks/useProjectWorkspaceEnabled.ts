import { useQuery } from "@tanstack/react-query";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";

/** Fail closed while settings are loading or unavailable. */
export function useProjectWorkspaceEnabled() {
  const query = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  return {
    enabled: query.data?.enableProjectWorkspace === true,
    loaded: query.isSuccess,
    error: query.error,
  };
}
