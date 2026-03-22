"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SopMermaidBlock } from "./SopMermaidBlock";

type ProjectSummary = {
  project_id: string;
  client_name: string;
  project_name: string;
  status: string;
  sop_version: number;
  updated_at: string;
};

type Section = { title: string; markdown: string };

type DiagramBundle = Record<string, string>;

const DIAGRAM_LABELS: Record<string, string> = {
  systemOverview: "System overview",
  agentFlow: "Agent flow",
  databaseSchema: "Database schema",
  techStack: "Tech stack",
  timeline: "Timeline",
};

export function SopCrmTab() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramBundle>({});
  const [meta, setMeta] = useState<{ project_name: string; client_name: string; status: string; sop_version: number } | null>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [subTab, setSubTab] = useState<"sections" | "diagrams" | "new">("sections");
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newAgents, setNewAgents] = useState("scheduler-engine, report-builder");
  const [newBusy, setNewBusy] = useState(false);

  const [changeNote, setChangeNote] = useState("");
  const [editedBy, setEditedBy] = useState("");

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListErr(null);
    try {
      const res = await fetch("/api/crm/sops", { cache: "no-store", credentials: "same-origin" });
      const json = await res.json();
      if (res.status === 401) throw new Error("Unauthorized — sign in at /admin/login");
      if (!json.ok) throw new Error(json.error ?? "Failed to list SOPs");
      setProjects(json.projects ?? []);
    } catch (e: unknown) {
      setListErr(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    setDetailErr(null);
    setSaveState("idle");
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/crm/sops/${encodeURIComponent(projectId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (res.status === 401) throw new Error("Unauthorized");
      if (!json.ok) throw new Error(json.error ?? "Failed to load project");
      setSections(Array.isArray(json.sections) ? json.sections : []);
      setDiagrams((json.diagram_bundle && typeof json.diagram_bundle === "object" ? json.diagram_bundle : {}) as DiagramBundle);
      const p = json.project;
      if (p) {
        setMeta({
          project_name: String(p.project_name ?? ""),
          client_name: String(p.client_name ?? ""),
          status: String(p.status ?? "draft"),
          sop_version: Number(p.sop_version ?? 1),
        });
      } else {
        setMeta(null);
      }
    } catch (e: unknown) {
      setDetailErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const updateSection = useCallback((index: number, field: "title" | "markdown", value: string) => {
    setSections((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      next[index] = row;
      return next;
    });
  }, []);

  const updateDiagram = useCallback((key: string, value: string) => {
    setDiagrams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async (mode: "sections" | "diagrams") => {
    if (!selectedId) return;
    setSaveState("saving");
    setSaveMsg(null);
    try {
      const payload: Record<string, unknown> = {
        change_note: changeNote.trim() || undefined,
        edited_by: editedBy.trim() || undefined,
      };
      if (mode === "sections") payload.sections = sections;
      if (mode === "diagrams") payload.diagram_bundle = diagrams;

      const res = await fetch(`/api/crm/sops/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(typeof json.error === "string" ? json.error : "Save failed");
      setSections(Array.isArray(json.sections) ? json.sections : sections);
      setDiagrams((json.diagram_bundle && typeof json.diagram_bundle === "object" ? json.diagram_bundle : diagrams) as DiagramBundle);
      if (json.project) {
        setMeta({
          project_name: String(json.project.project_name ?? ""),
          client_name: String(json.project.client_name ?? ""),
          status: String(json.project.status ?? "draft"),
          sop_version: Number(json.project.sop_version ?? 1),
        });
      }
      setSaveState("ok");
      setSaveMsg("Saved.");
      void loadList();
    } catch (e: unknown) {
      setSaveState("err");
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [selectedId, sections, diagrams, changeNote, editedBy, loadList]);

  const createSop = useCallback(async () => {
    setNewBusy(true);
    setListErr(null);
    try {
      const agents = newAgents
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/crm/sops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          project_name: newProjectName.trim(),
          client_name: newClientName.trim(),
          required_agents: agents.length ? agents : [],
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Create failed");
      await loadList();
      if (json.project_id) {
        setSelectedId(String(json.project_id));
        setSubTab("sections");
      }
      setNewProjectName("");
      setNewClientName("");
    } catch (e: unknown) {
      setListErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNewBusy(false);
    }
  }, [newProjectName, newClientName, newAgents, loadList]);

  const previewKey = useMemo(() => {
    const keys = Object.keys(diagrams);
    return keys.find((k) => (diagrams[k] ?? "").trim().length > 0) ?? keys[0];
  }, [diagrams]);

  const previewCode = previewKey ? diagrams[previewKey] ?? "" : "";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(200px,280px)_1fr]">
      <aside className="rounded-2xl border border-white/10 bg-black/30 p-4 h-fit">
        <div className="text-xs uppercase tracking-[0.14em] text-textMuted">Projects</div>
        {listLoading ? <div className="mt-3 text-sm text-textMuted">Loading…</div> : null}
        {listErr ? <div className="mt-3 text-sm text-rose-200/80">{listErr}</div> : null}
        <ul className="mt-3 space-y-1 max-h-[420px] overflow-y-auto">
          {projects.map((p) => (
            <li key={p.project_id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(p.project_id);
                  setSubTab("sections");
                }}
                className={[
                  "w-full text-left rounded-lg px-3 py-2 text-sm transition",
                  selectedId === p.project_id ? "bg-sky-500/15 text-sky-100 border border-sky-500/25" : "text-textMuted hover:bg-white/5 border border-transparent",
                ].join(" ")}
              >
                <div className="font-medium text-textPrimary truncate">{p.project_name}</div>
                <div className="text-xs text-textMuted truncate">{p.client_name}</div>
                <div className="text-[10px] text-textMuted mt-0.5">
                  v{p.sop_version} · {p.status}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            setSubTab("new");
            setSelectedId(null);
          }}
          className="mt-4 w-full rounded-lg border border-white/15 bg-white/5 py-2 text-xs font-semibold text-sky-200 hover:bg-white/10"
        >
          + New SOP
        </button>
      </aside>

      <section className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden min-h-[480px]">
        <div className="border-b border-white/10 px-5 py-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("sections")}
            className={subTab === "sections" ? "rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200" : "rounded-full border border-white/10 px-3 py-1 text-xs text-textMuted"}
          >
            Sections
          </button>
          <button
            type="button"
            onClick={() => setSubTab("diagrams")}
            className={subTab === "diagrams" ? "rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200" : "rounded-full border border-white/10 px-3 py-1 text-xs text-textMuted"}
          >
            Diagrams
          </button>
          <button
            type="button"
            onClick={() => setSubTab("new")}
            className={subTab === "new" ? "rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200" : "rounded-full border border-white/10 px-3 py-1 text-xs text-textMuted"}
          >
            New SOP
          </button>
        </div>

        <div className="p-5">
          {subTab === "new" ? (
            <div className="max-w-lg space-y-4">
              <p className="text-sm text-textMuted">Creates a full SOP in the database (and Notion when configured). Minimum: project and client name.</p>
              <label className="block text-xs text-textMuted">
                Project name
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-textPrimary"
                  placeholder="e.g. Acme onboarding"
                />
              </label>
              <label className="block text-xs text-textMuted">
                Client name
                <input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-textPrimary"
                  placeholder="e.g. Acme Corp"
                />
              </label>
              <label className="block text-xs text-textMuted">
                Required agents (comma-separated)
                <input
                  value={newAgents}
                  onChange={(e) => setNewAgents(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-textPrimary font-mono"
                />
              </label>
              <button
                type="button"
                disabled={newBusy || !newProjectName.trim() || !newClientName.trim()}
                onClick={() => void createSop()}
                className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white"
              >
                {newBusy ? "Creating…" : "Generate SOP"}
              </button>
            </div>
          ) : !selectedId ? (
            <div className="text-sm text-textMuted">Select a project or create a new SOP.</div>
          ) : detailLoading ? (
            <div className="text-sm text-textMuted">Loading SOP…</div>
          ) : detailErr ? (
            <div className="text-sm text-rose-200/80">{detailErr}</div>
          ) : subTab === "diagrams" ? (
            <div className="space-y-6">
              {meta ? (
                <div className="text-sm text-textMuted">
                  {meta.client_name} / {meta.project_name} · v{meta.sop_version}
                </div>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  {Object.keys(DIAGRAM_LABELS).map((key) => (
                    <label key={key} className="block text-xs text-textMuted">
                      {DIAGRAM_LABELS[key]}
                      <textarea
                        value={diagrams[key] ?? ""}
                        onChange={(e) => updateDiagram(key, e.target.value)}
                        rows={8}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-textPrimary"
                        spellCheck={false}
                      />
                    </label>
                  ))}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-textMuted mb-2">Preview ({previewKey})</div>
                  {previewCode.trim() ? <SopMermaidBlock code={previewCode} /> : <div className="text-sm text-textMuted">No diagram source yet.</div>}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
                <label className="text-xs text-textMuted flex-1 min-w-[140px]">
                  Change note (audit)
                  <input
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                    placeholder="e.g. Clarified handoff steps"
                  />
                </label>
                <label className="text-xs text-textMuted flex-1 min-w-[120px]">
                  Edited by
                  <input
                    value={editedBy}
                    onChange={(e) => setEditedBy(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                    placeholder="optional"
                  />
                </label>
                <button
                  type="button"
                  disabled={saveState === "saving"}
                  onClick={() => void save("diagrams")}
                  className="rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saveState === "saving" ? "Saving…" : "Save diagrams"}
                </button>
              </div>
              {saveMsg ? <div className={`text-sm ${saveState === "err" ? "text-rose-200" : "text-emerald-200/90"}`}>{saveMsg}</div> : null}
            </div>
          ) : (
            <div className="space-y-4">
              {meta ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-textMuted">
                    {meta.client_name} / {meta.project_name} · v{meta.sop_version} · {meta.status}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSections((prev) => [...prev, { title: "New section", markdown: "" }])}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-white/10"
                >
                  + Add section
                </button>
                <span className="text-xs text-textMuted">Empty SOP? Add sections here, then save.</span>
              </div>
              <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
                {sections.length === 0 ? (
                  <div className="text-sm text-textMuted">No sections yet — use &quot;Add section&quot; or generate a new SOP.</div>
                ) : (
                  sections.map((s, i) => (
                    <details key={`${s.title}_${i}`} className="rounded-xl border border-white/10 bg-black/20 open:bg-black/30" open={i < 2}>
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-textPrimary">{s.title || `Section ${i + 1}`}</summary>
                      <div className="px-3 pb-3 space-y-2">
                        <input
                          value={s.title}
                          onChange={(e) => updateSection(i, "title", e.target.value)}
                          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-textPrimary"
                          placeholder="Title"
                        />
                        <textarea
                          value={s.markdown}
                          onChange={(e) => updateSection(i, "markdown", e.target.value)}
                          rows={10}
                          className="w-full rounded border border-white/10 bg-black/40 px-2 py-2 text-xs font-mono text-textPrimary leading-relaxed"
                          spellCheck={false}
                        />
                      </div>
                    </details>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
                <label className="text-xs text-textMuted flex-1 min-w-[140px]">
                  Change note (audit)
                  <input
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-textMuted flex-1 min-w-[120px]">
                  Edited by
                  <input
                    value={editedBy}
                    onChange={(e) => setEditedBy(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={saveState === "saving"}
                  onClick={() => void save("sections")}
                  className="rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saveState === "saving" ? "Saving…" : "Save sections"}
                </button>
              </div>
              {saveMsg ? <div className={`text-sm ${saveState === "err" ? "text-rose-200" : "text-emerald-200/90"}`}>{saveMsg}</div> : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
