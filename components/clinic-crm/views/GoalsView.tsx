"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Plus, Target } from "lucide-react";
import type { Goal } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Button } from "../ui/Button";
import { useToast } from "@/components/clinic-crm/providers/ToastProvider";
import { GoalDrawer, type GoalFields } from "./GoalDrawer";
import { PageHeader } from "./PageHeader";
import { errorMessage } from "./errors";
import { METRIC, fmtDay, toDateInput } from "./format";

const CANVAS = 4000; // GoalInput caps x/y at 4000
const NOTE_W = 232;
const NOTE_H = 190;
const KEY_STEP = 10;
const SAVE_DELAY = 500;
const DRAG_THRESHOLD = 4;

const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), max));

/** 0–100, respecting metrics where lower is better (no-show rate, speed to lead). */
function goalPct(g: Goal): number | null {
  if (g.target == null || g.progress == null) return null;
  const pct = METRIC[g.metric].lowerIsBetter
    ? g.progress <= g.target
      ? 100
      : (g.target / g.progress) * 100
    : g.target === 0
      ? 100
      : (g.progress / g.target) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

type Editing = { goal: Goal | null; at?: { x: number; y: number } } | null;

export function GoalsView() {
  const { show: toast } = useToast();
  const q = useQuery("goals", () => api.goals.list());
  const [notes, setNotes] = useState<Goal[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const board = useRef<HTMLDivElement>(null);
  const pending = useRef(new Map<string, { patch: Partial<Goal>; timer: ReturnType<typeof setTimeout> }>());

  // Server data wins unless a local move is still waiting to be saved.
  useEffect(() => {
    if (q.data && pending.current.size === 0) setNotes(q.data);
  }, [q.data]);

  const local = (id: string, patch: Partial<Goal>) => setNotes((all) => all.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  /** Optimistic update now, one debounced PATCH per note. */
  const persist = (id: string, patch: Partial<Goal>) => {
    local(id, patch);
    const prev = pending.current.get(id);
    if (prev) clearTimeout(prev.timer);
    const merged = { ...prev?.patch, ...patch };
    const timer = setTimeout(async () => {
      pending.current.delete(id);
      try {
        await api.goals.update(id, merged);
      } catch (e) {
        toast(errorMessage(e, "Couldn't save the board."), "error");
        q.refresh();
      }
    }, SAVE_DELAY);
    pending.current.set(id, { patch: merged, timer });
  };

  const openCreateAt = (x: number, y: number) =>
    setEditing({ goal: null, at: { x: clamp(x, CANVAS - NOTE_W), y: clamp(y, CANVAS - NOTE_H) } });

  const createInView = () => {
    const el = board.current;
    if (!el) return openCreateAt(40, 40);
    openCreateAt(el.scrollLeft + el.clientWidth / 2 - NOTE_W / 2, el.scrollTop + el.clientHeight / 2 - NOTE_H / 2);
  };

  const onBoardDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // only empty canvas
    const rect = e.currentTarget.getBoundingClientRect();
    openCreateAt(e.clientX - rect.left - NOTE_W / 2, e.clientY - rect.top - 24);
  };

  const save = async (f: GoalFields) => {
    try {
      if (editing?.goal) {
        const updated = await api.goals.update(editing.goal.id, f);
        local(updated.id, updated);
      } else {
        const at = editing?.at ?? { x: 40, y: 40 };
        const { progress, ...input } = f;
        let created = await api.goals.create({ ...input, ...at });
        if (progress != null) created = await api.goals.update(created.id, { progress });
        setNotes((all) => [...all, created]);
      }
      setEditing(null);
    } catch (e) {
      toast(errorMessage(e, "Couldn't save the goal."), "error");
    }
  };

  const remove = async () => {
    const g = editing?.goal;
    if (!g) return;
    try {
      await api.goals.remove(g.id);
      setNotes((all) => all.filter((n) => n.id !== g.id));
      setEditing(null);
      toast("Goal removed", "success");
    } catch (e) {
      toast(errorMessage(e, "Couldn't remove the goal."), "error");
    }
  };

  return (
    <div className="cc-page flex flex-col md:h-[calc(100dvh-32px)]">
      <PageHeader
        title="Goals"
        subtitle="Your practice’s whiteboard. Drag notes around; double-click empty space to add one."
        actions={
          <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={createInView}>
            New goal
          </Button>
        }
      />
      <p id="cc-note-help" className="cc-sr-only">
        Use arrow keys to move the note, Enter to edit it.
      </p>

      <div
        ref={board}
        className="cc-board relative h-[calc(100dvh-var(--cc-tabbar)-15rem)] min-h-[420px] md:h-auto md:flex-1"
        role="region"
        aria-label="Goals whiteboard"
      >
        <div className="relative" style={{ width: CANVAS, height: CANVAS }} onDoubleClick={onBoardDoubleClick}>
          {notes.map((g) => (
            <StickyNote
              key={g.id}
              goal={g}
              onMove={(x, y) => local(g.id, { x, y })}
              onMoveEnd={(x, y) => persist(g.id, { x, y })}
              onNudge={(dx, dy) => persist(g.id, { x: clamp(g.x + dx, CANVAS - NOTE_W), y: clamp(g.y + dy, CANVAS - NOTE_H) })}
              onToggleDone={() => persist(g.id, { done: !g.done })}
              onEdit={() => setEditing({ goal: g })}
            />
          ))}
        </div>

        {q.error && !q.data && (
          <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
            <p className="cc-notice pointer-events-auto" data-tone="danger" role="alert">
              {errorMessage(q.error, "Couldn't load the board.")}{" "}
              <button type="button" className="underline" onClick={() => void q.refresh()}>
                Retry
              </button>
            </p>
          </div>
        )}

        {q.data && notes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <div className="cc-card pointer-events-auto max-w-sm p-6 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl cc-surface-2 cc-accent" aria-hidden>
                <Target size={26} />
              </div>
              <h2 className="text-lg font-semibold">Pin your first goal</h2>
              <p className="cc-muted mt-2 text-sm leading-relaxed">
                Double-click anywhere on the board — or tap below — to add a sticky note, like “No-shows under 5% by December”.
              </p>
              <Button variant="primary" className="mt-5" icon={<Plus size={18} aria-hidden />} onClick={createInView}>
                New goal
              </Button>
            </div>
          </div>
        )}
      </div>

      <GoalDrawer open={editing !== null} goal={editing?.goal ?? null} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />
    </div>
  );
}

function StickyNote({
  goal: g,
  onMove,
  onMoveEnd,
  onNudge,
  onToggleDone,
  onEdit,
}: {
  goal: Goal;
  onMove: (x: number, y: number) => void;
  onMoveEnd: (x: number, y: number) => void;
  onNudge: (dx: number, dy: number) => void;
  onToggleDone: () => void;
  onEdit: () => void;
}) {
  const reduce = useReducedMotion();
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean; last: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const pct = goalPct(g);
  const unit = METRIC[g.metric].unit;
  const overdue = !g.done && g.dueOn !== null && g.dueOn < toDateInput(new Date());

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: g.x, y: g.y, moved: false, last: { x: g.x, y: g.y } };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    d.last = { x: clamp(d.x + dx, CANVAS - NOTE_W), y: clamp(d.y + dy, CANVAS - NOTE_H) };
    onMove(d.last.x, d.last.y);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d?.moved) onMoveEnd(d.last.x, d.last.y);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
    };
    if (moves[e.key]) {
      e.preventDefault();
      onNudge(...moves[e.key]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onEdit();
    }
  };

  return (
    <motion.div
      role="group"
      tabIndex={0}
      aria-label={`${g.title}${g.done ? ", done" : ""}`}
      aria-describedby="cc-note-help"
      className="cc-note"
      data-color={g.color}
      data-done={g.done}
      data-dragging={dragging}
      style={{ left: g.x, top: g.y }}
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: dragging && !reduce ? 1.03 : 1, rotate: dragging && !reduce ? -1.5 : 0 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider opacity-70">{METRIC[g.metric].label}</span>
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={g.done}
          aria-label={g.done ? "Mark as not done" : "Mark as done"}
          className="-m-2 grid h-11 w-11 place-items-center rounded-full"
        >
          <span
            className="grid h-6 w-6 place-items-center rounded-full border-2"
            style={{ borderColor: "currentColor", background: g.done ? "var(--cc-note-ink)" : "transparent" }}
          >
            {g.done && <Check size={14} strokeWidth={3} aria-hidden style={{ color: `var(--cc-note-${g.color})` }} />}
          </span>
        </button>
      </div>
      <p className="cc-heading mt-1 text-[17px] font-semibold leading-snug" style={{ textDecoration: g.done ? "line-through" : undefined }}>
        {g.title}
      </p>
      {(g.target != null || g.progress != null) && (
        <p className="cc-num mt-2 text-sm">
          <span className="font-semibold">
            {unit === "R" ? "R" : ""}
            {g.progress ?? "—"}
          </span>
          <span className="opacity-70">
            {" "}
            / {unit === "R" ? "R" : ""}
            {g.target ?? "—"}
            {unit && unit !== "R" ? ` ${unit}` : ""}
          </span>
        </p>
      )}
      {pct !== null && (
        <div className="cc-note-bar mt-2" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {g.dueOn && (
        <p className="mt-3 text-xs font-medium" style={{ opacity: overdue ? 1 : 0.7 }}>
          {overdue ? "Overdue · " : "Due "}
          {fmtDay(`${g.dueOn}T00:00:00`)}
        </p>
      )}
    </motion.div>
  );
}
