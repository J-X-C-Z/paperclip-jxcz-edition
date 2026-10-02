import { describe, expect, it } from "vitest";
import { projectScopeFromSearch, projectScopeSearch, resolveProjectScope } from "./project-scope";
import { createProjectScopeStorage } from "./project-scope-storage";

const projects = [
  { id: "a1", companyId: "a" },
  { id: "a2", companyId: "a" },
  { id: "b1", companyId: "b" },
];
const base = { enabled: true, companyId: "a", urlProjectId: undefined, savedProjectId: null, projects };

describe("project scope resolution", () => {
  it("defaults to All Company and restores a valid saved project", () => {
    expect(resolveProjectScope(base)).toBeNull();
    expect(resolveProjectScope({ ...base, savedProjectId: "a1" })).toBe("a1");
  });
  it("URL overrides saved selection, including explicit company mode", () => {
    expect(resolveProjectScope({ ...base, savedProjectId: "a1", urlProjectId: "a2" })).toBe("a2");
    expect(resolveProjectScope({ ...base, savedProjectId: "a1", urlProjectId: null })).toBeNull();
  });
  it("invalid URL falls back to company rather than a different saved project", () => {
    expect(resolveProjectScope({ ...base, savedProjectId: "a1", urlProjectId: "deleted" })).toBeNull();
  });
  it("does not expose an ID until project validation succeeds", () => {
    expect(resolveProjectScope({ ...base, savedProjectId: "a1", projects: undefined })).toBeNull();
    expect(resolveProjectScope({ ...base, savedProjectId: "a1", projects: [] })).toBeNull();
  });
  it("rejects foreign projects and resets on company change", () => {
    expect(resolveProjectScope({ ...base, urlProjectId: "b1" })).toBeNull();
    expect(resolveProjectScope({ ...base, companyId: "b", savedProjectId: "a1" })).toBeNull();
    expect(resolveProjectScope({ ...base, companyId: "b", savedProjectId: "b1" })).toBe("b1");
  });
  it("feature off always resolves to company", () => {
    expect(resolveProjectScope({ ...base, enabled: false, savedProjectId: "a1", urlProjectId: "a2" })).toBeNull();
    expect(resolveProjectScope({ ...base, companyId: null, urlProjectId: "a2" })).toBeNull();
  });
  it("parses URL presence separately from All Company", () => {
    expect(projectScopeFromSearch("?q=test")).toBeUndefined();
    expect(projectScopeFromSearch("?project=")).toBeNull();
    expect(projectScopeFromSearch("?project=a2")).toBe("a2");
  });
  it("keeps unrelated parameters while switching", () => {
    const search = projectScopeSearch("?q=auth&status=todo&project=a1", "a2");
    expect(new URLSearchParams(search).get("q")).toBe("auth");
    expect(new URLSearchParams(search).get("status")).toBe("todo");
    expect(projectScopeFromSearch(search)).toBe("a2");
    expect(projectScopeFromSearch(projectScopeSearch(search, null))).toBeNull();
  });
});

describe("project scope preferences", () => {
  function memoryStorage(initial = "{}") {
    let value = initial;
    return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  }
  it("persists company A/B independently and clears explicitly", () => {
    const backend = memoryStorage();
    const storage = createProjectScopeStorage(backend);
    storage.write("a", "a1");
    storage.write("b", "b1");
    expect(createProjectScopeStorage(backend).read("a")).toBe("a1");
    expect(storage.read("b")).toBe("b1");
    storage.write("a", null);
    expect(storage.read("a")).toBeNull();
    expect(storage.read("b")).toBe("b1");
  });
  it("handles missing, malformed and invalid preferences", () => {
    for (const initial of ["broken", "null", "[]", '"x"', '{"a":12}', '{"a":""}']) {
      expect(createProjectScopeStorage(memoryStorage(initial)).read("a")).toBeNull();
    }
    expect(createProjectScopeStorage(memoryStorage()).read("toString")).toBeNull();
    expect(createProjectScopeStorage(null).read("a")).toBeNull();
  });
  it("storage failure does not break scope changes", () => {
    const storage = createProjectScopeStorage({
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
    });
    expect(storage.read("a")).toBeNull();
    expect(() => storage.write("a", "a1")).not.toThrow();
  });
});
