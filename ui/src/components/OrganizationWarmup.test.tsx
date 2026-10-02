// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrganizationWarmup } from "./OrganizationWarmup";
import { organizationGroupsKey } from "../api/improvementTeams";

const mocks = vi.hoisted(() => ({
  company: { selectedCompanyId: "first", selectedCompany: { id: "first" }, loading: false, error: null as Error | null },
  list: vi.fn(),
}));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => mocks.company }));
vi.mock("../api/improvementTeams", async original => ({ ...await original<typeof import("../api/improvementTeams")>(), improvementTeamsApi: { list: mocks.list } }));
vi.mock("../pages/Departments", () => ({ Departments: () => null }));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><OrganizationWarmup /></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
beforeEach(() => {
  mocks.company = { selectedCompanyId: "first", selectedCompany: { id: "first" }, loading: false, error: null };
  mocks.list.mockReset().mockImplementation(async (companyId: string) => ({ teams: [], departments: [{ id: companyId }], agents: [], projects: [] }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });

it("prepares the company data once before the department page mounts", async () => {
  await render(); await render();
  expect(mocks.list).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(organizationGroupsKey("first"))).toMatchObject({ departments: [{ id: "first" }] });
  expect(host.childElementCount).toBe(0);
});
it("does not warm an unknown or unauthorized company while validation is pending", async () => {
  mocks.company.loading = true; await render();
  mocks.company.loading = false; mocks.company.error = new Error("denied"); await render();
  mocks.company.error = null; mocks.company.selectedCompany = { id: "different" }; await render();
  expect(mocks.list).not.toHaveBeenCalled();
});
it("prepares each company's own cache and preserves isolation on switching", async () => {
  await render();
  mocks.company.selectedCompanyId = "second"; mocks.company.selectedCompany = { id: "second" };
  await render();
  expect(client.getQueryData(organizationGroupsKey("second"))).toMatchObject({ departments: [{ id: "second" }] });
  expect(client.getQueryData(organizationGroupsKey("first"))).toMatchObject({ departments: [{ id: "first" }] });
});
