// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorAutocompleteProvider, useEditorAutocomplete } from "./EditorAutocompleteContext";
import { queryKeys } from "../lib/queryKeys";

const mocks = vi.hoisted(() => ({ companyId: "company-a", skills: vi.fn(), routines: vi.fn() }));
vi.mock("./CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: mocks.companyId }) }));
vi.mock("../api/companySkills", () => ({ companySkillsApi: { list: mocks.skills } }));
vi.mock("../api/routines", () => ({ routinesApi: { list: mocks.routines } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

function Editor({ name }: { name: string }) {
  const { slashCommands } = useEditorAutocomplete();
  return <output data-name={name}>{slashCommands.map((option) => option.id).join(",")}</output>;
}

function render(children: ReactNode) {
  return act(async () => root.render(
    <QueryClientProvider client={client}>
      <EditorAutocompleteProvider>{children}</EditorAutocompleteProvider>
    </QueryClientProvider>,
  ));
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.companyId = "company-a";
  mocks.skills.mockImplementation(async (companyId: string) => [{
    id: `${companyId}-skill`, key: "demo", name: `${companyId} skill`, slug: "demo", description: null,
  }]);
  mocks.routines.mockImplementation(async (companyId: string) => [{
    id: `${companyId}-routine`, title: `${companyId} routine`, status: "active",
  }]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); host.remove();
});

describe("editor autocomplete loading", () => {
  it("does not fetch skills or routines until an editor consumer mounts", async () => {
    await render(<div>Page without editor</div>);
    await settle();
    expect(mocks.skills).not.toHaveBeenCalled();
    expect(mocks.routines).not.toHaveBeenCalled();
  });

  it("loads for mounted editors, shares the company cache, and stops observing after the last editor unmounts", async () => {
    await render(<><Editor name="one" /><Editor name="two" /></>);
    await settle();
    expect(mocks.skills).toHaveBeenCalledTimes(1);
    expect(mocks.skills).toHaveBeenCalledWith("company-a");
    expect(mocks.routines).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("company-a-skill");
    expect(host.textContent).toContain("company-a-routine");

    await render(<Editor name="one" />);
    expect(host.textContent).toContain("company-a-skill");
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.companySkills.list("company-a") });
      await client.invalidateQueries({ queryKey: queryKeys.routines.list("company-a") });
    });
    expect(mocks.skills).toHaveBeenCalledTimes(2);
    expect(mocks.routines).toHaveBeenCalledTimes(2);

    await render(<div>Page without editor</div>);
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.companySkills.list("company-a") });
      await client.invalidateQueries({ queryKey: queryKeys.routines.list("company-a") });
    });
    expect(mocks.skills).toHaveBeenCalledTimes(2);
    expect(mocks.routines).toHaveBeenCalledTimes(2);
  });

  it("keeps company-specific query keys and options isolated across a company switch", async () => {
    await render(<Editor name="one" />);
    await settle();
    expect(host.textContent).toContain("company-a-skill");

    mocks.companyId = "company-b";
    await render(<Editor name="one" />);
    await settle();
    expect(mocks.skills).toHaveBeenCalledWith("company-b");
    expect(mocks.routines).toHaveBeenCalledWith("company-b");
    expect(host.textContent).toContain("company-b-skill");
    expect(host.textContent).not.toContain("company-a-skill");
    expect(client.getQueryData(queryKeys.companySkills.list("company-a"))).toBeDefined();
    expect(client.getQueryData(queryKeys.companySkills.list("company-b"))).toBeDefined();
  });

  it("remains stable through StrictMode effect remounts", async () => {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <StrictMode><EditorAutocompleteProvider><Editor name="strict" /></EditorAutocompleteProvider></StrictMode>
      </QueryClientProvider>,
    ));
    await settle();
    expect(mocks.skills).toHaveBeenCalledTimes(1);
    expect(mocks.routines).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("company-a-skill");
  });
});
