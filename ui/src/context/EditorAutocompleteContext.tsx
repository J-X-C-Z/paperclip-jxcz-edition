import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildRoutineMentionHref, buildSkillMentionHref } from "@paperclipai/shared";
import { companySkillsApi } from "../api/companySkills";
import { routinesApi } from "../api/routines";
import { useCompany } from "./CompanyContext";
import { queryKeys } from "../lib/queryKeys";

export interface SkillCommandOption {
  id: string;
  kind: "skill";
  skillId: string;
  key: string;
  name: string;
  slug: string;
  description: string | null;
  href: string;
  aliases: string[];
}

export interface RoutineCommandOption {
  id: string;
  kind: "routine";
  routineId: string;
  name: string;
  status: string;
  href: string;
  aliases: string[];
}

export interface ActionCommandOption {
  id: string;
  kind: "action";
  command: string;
  name: string;
  description: string;
  aliases: string[];
  disabled?: boolean;
  disabledReason?: string | null;
}

export type SlashCommandOption = SkillCommandOption | RoutineCommandOption | ActionCommandOption;

interface EditorAutocompleteContextValue {
  slashCommands: SlashCommandOption[];
  registerConsumer: () => () => void;
}

const EditorAutocompleteContext = createContext<EditorAutocompleteContextValue>({
  slashCommands: [],
  registerConsumer: () => () => {},
});

export function EditorAutocompleteProvider({ children }: { children: ReactNode }) {
  const { selectedCompanyId } = useCompany();
  const consumerCount = useRef(0);
  const [hasConsumers, setHasConsumers] = useState(false);
  const registerConsumer = useCallback(() => {
    consumerCount.current += 1;
    setHasConsumers(true);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      consumerCount.current = Math.max(0, consumerCount.current - 1);
      setHasConsumers(consumerCount.current > 0);
    };
  }, []);
  const { data: companySkills = [] } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.companySkills.list(selectedCompanyId)
      : ["company-skills", "__none__"],
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && hasConsumers),
  });
  const { data: routines = [] } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.routines.list(selectedCompanyId)
      : ["routines", "__none__", "__all-projects__"],
    queryFn: () => routinesApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && hasConsumers),
  });

  const value = useMemo<EditorAutocompleteContextValue>(() => ({
    registerConsumer,
    slashCommands: [
      ...companySkills.map((skill) => ({
        id: `skill:${skill.id}`,
        kind: "skill" as const,
        skillId: skill.id,
        key: skill.key,
        name: skill.name,
        slug: skill.slug,
        description: skill.description ?? null,
        href: buildSkillMentionHref(skill.id, skill.slug),
        aliases: [skill.slug, skill.name, skill.key],
      })),
      ...routines
        .filter((routine) => routine.status !== "archived")
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((routine) => ({
          id: `routine:${routine.id}`,
          kind: "routine" as const,
          routineId: routine.id,
          name: routine.title,
          status: routine.status,
          href: buildRoutineMentionHref(routine.id),
          aliases: [`routine:${routine.title}`, routine.title, routine.id],
        })),
    ],
  }), [companySkills, routines, registerConsumer]);

  return (
    <EditorAutocompleteContext.Provider value={value}>
      {children}
    </EditorAutocompleteContext.Provider>
  );
}

export function useEditorAutocomplete() {
  const context = useContext(EditorAutocompleteContext);
  useEffect(() => context.registerConsumer(), [context.registerConsumer]);
  return { slashCommands: context.slashCommands };
}
