"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_LABELS, TEAM_ROLES, type TeamRole } from "../../../lib/admin/roles";

type Member = {
  id: string;
  username: string;
  email: string;
  role: TeamRole;
  status: string;
  created_at: string;
  full_name: string | null;
  last_login_at: string | null;
  has_password: boolean;
  has_pending_invite: boolean;
};

type PendingInv = {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: string;
  expires_at: string;
  created_at: string;
};

type SessionInfo = { role: TeamRole; member_id: string | null };

type EditModalProps = {
  member: Member;
  manageUsers: boolean;
  sessionRole: TeamRole;
  onClose: () => void;
  onDone: () => void;
};

export function TeamConsole() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingInv[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<keyof Member | "">("username");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [err, setErr] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const manageUsers = session?.role === "super_admin";
  const canInvite = session && ["super_admin", "admin"].includes(session.role);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [sr, tr] = await Promise.all([fetch("/api/admin/session"), fetch("/api/admin/team")]);
      const sj = (await sr.json()) as { authenticated?: boolean; role?: TeamRole; member_id?: string | null };
      if (sr.ok && sj.authenticated && sj.role) {
        setSession({ role: sj.role, member_id: sj.member_id ?? null });
      }
      const tj = (await tr.json()) as { ok?: boolean; members?: Member[]; pending_invitations?: PendingInv[]; error?: string };
      if (!tr.ok || !tj.ok) {
        setErr(tj.error ?? "Could not load team");
        return;
      }
      setMembers(tj.members ?? []);
      setPending(tj.pending_invitations ?? []);
    } catch {
      setErr("Network error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = [...members];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((m) => m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    if (roleFilter) {
      rows = rows.filter((m) => m.role === roleFilter);
    }
    if (sortKey) {
      rows.sort((a, b) => {
        const av = String(a[sortKey as keyof Member] ?? "");
        const bv = String(b[sortKey as keyof Member] ?? "");
        const c = av.localeCompare(bv);
        return sortDir === "asc" ? c : -c;
      });
    }
    return rows;
  }, [members, search, roleFilter, sortKey, sortDir]);

  function toggleSort(k: keyof Member) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const editing = editId ? members.find((m) => m.id === editId) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl text-textPrimary">Team</h1>
          <p className="mt-1 text-sm text-textMuted">Members and invitations</p>
        </div>
        {canInvite ? (
          <button type="button" onClick={() => setInviteOpen(true)} className="vs-button-primary justify-center">
            Invite team member
          </button>
        ) : null}
      </div>

      {err ? <p className="text-sm text-rose-300">{err}</p> : null}

      {pending.length > 0 ? (
        <section className="vs-card">
          <h2 className="font-heading text-lg text-textPrimary">Pending invitations</h2>
          <ul className="mt-4 space-y-2 text-sm text-textMuted">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-2">
                <span>
                  {p.email} · @{p.username} · {ROLE_LABELS[p.role as TeamRole] ?? p.role}
                </span>
                <span className="text-xs">expires {new Date(p.expires_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="vs-input max-w-xs"
          placeholder="Search username or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search team"
        />
        <select className="vs-input max-w-xs" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {TEAM_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm text-textPrimary">
          <thead className="border-b border-white/10 bg-black/40 text-xs uppercase tracking-wider text-textMuted">
            <tr>
              {(["username", "email", "full_name", "role", "status", "created_at", "last_login_at"] as const).map((k) => (
                <th key={k} className="cursor-pointer px-3 py-3 font-medium" onClick={() => toggleSort(k as keyof Member)}>
                  {k.replace(/_/g, " ")}
                  {sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th className="px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2">{m.username}</td>
                <td className="px-3 py-2">{m.email}</td>
                <td className="px-3 py-2">{m.full_name ?? "—"}</td>
                <td className="px-3 py-2">{ROLE_LABELS[m.role]}</td>
                <td className="px-3 py-2">{m.status}</td>
                <td className="px-3 py-2 text-textMuted">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-textMuted">{m.last_login_at ? new Date(m.last_login_at).toLocaleString() : "—"}</td>
                <td className="space-x-2 px-3 py-2">
                  <button type="button" className="text-accent underline" onClick={() => setEditId(m.id)}>
                    Edit
                  </button>
                  {manageUsers && m.role !== "super_admin" ? (
                    <>
                      {m.status === "active" ? (
                        <button
                          type="button"
                          className="text-amber-300 underline"
                          onClick={async () => {
                            if (!confirm(`Deactivate ${m.username}?`)) return;
                            await fetch(`/api/admin/team/${m.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "inactive" }),
                            });
                            load();
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-emerald-300 underline"
                          onClick={async () => {
                            await fetch(`/api/admin/team/${m.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "active" }),
                            });
                            load();
                          }}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="underline"
                        onClick={async () => {
                          await fetch(`/api/admin/team/${m.id}/password`, { method: "POST" });
                          alert("Reset email sent if configured.");
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="text-rose-300 underline"
                        onClick={async () => {
                          if (!confirm(`Permanently remove ${m.username}?`)) return;
                          const r = await fetch(`/api/admin/team/${m.id}`, { method: "DELETE" });
                          if (!r.ok) alert("Could not remove");
                          load();
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                  {!manageUsers && canInvite ? (
                    <button
                      type="button"
                      className="underline"
                      onClick={async () => {
                        await fetch(`/api/admin/team/${m.id}/password`, { method: "POST" });
                        alert("Reset email sent if configured.");
                      }}
                    >
                      Reset password
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inviteOpen && canInvite && session ? (
        <InviteModal
          sessionRole={session.role}
          onClose={() => setInviteOpen(false)}
          onDone={() => {
            setInviteOpen(false);
            load();
          }}
        />
      ) : null}

      {editing && session ? (
        <EditModal
          member={editing}
          manageUsers={manageUsers}
          sessionRole={session.role}
          onClose={() => setEditId(null)}
          onDone={() => {
            setEditId(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function InviteModal({
  sessionRole,
  onClose,
  onDone,
}: {
  sessionRole: TeamRole;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const roleChoices = sessionRole === "super_admin" ? TEAM_ROLES : TEAM_ROLES.filter((r) => r !== "super_admin");
  const [role, setRole] = useState<TeamRole>(roleChoices[0] ?? "viewer");
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          full_name: fullName.trim() || null,
          role,
          send_invite_only: true,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !j.ok) {
        setLocalErr(j.error ?? "Invite failed");
        return;
      }
      alert(j.message ?? "Invitation sent");
      onDone();
    } catch {
      setLocalErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal>
      <div className="vs-card max-h-[90vh] w-full max-w-md overflow-y-auto">
        <h2 className="font-heading text-xl text-textPrimary">Invite member</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-textMuted">Email</label>
            <input className="vs-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-textMuted">Username</label>
            <input className="vs-input" required value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={20} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-textMuted">Full name (optional)</label>
            <input className="vs-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-textMuted">Role</label>
            <select className="vs-input" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
              {roleChoices.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {localErr ? <p className="text-sm text-rose-300">{localErr}</p> : null}
          <div className="flex gap-2 pt-2">
            <button type="button" className="vs-button-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="vs-button-primary flex-1 justify-center disabled:opacity-50">
              {loading ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditModal({ member, manageUsers, sessionRole, onClose, onDone }: EditModalProps) {
  const [fullName, setFullName] = useState(member.full_name ?? "");
  const [role, setRole] = useState<TeamRole>(member.role);
  const [status, setStatus] = useState(member.status);
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { full_name: fullName.trim() || null };
      if (manageUsers) {
        body.role = role;
        body.status = status;
      }
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setLocalErr(j.error ?? "Save failed");
        return;
      }
      onDone();
    } catch {
      setLocalErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal>
      <div className="vs-card w-full max-w-md">
        <h2 className="font-heading text-xl text-textPrimary">Edit {member.username}</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-textMuted">Email (read-only)</label>
            <input className="vs-input opacity-70" readOnly value={member.email} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-textMuted">Username (read-only)</label>
            <input className="vs-input opacity-70" readOnly value={member.username} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-textMuted">Full name</label>
            <input className="vs-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          {manageUsers ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-textMuted">Role</label>
                <select className="vs-input" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                  {(sessionRole === "super_admin" ? TEAM_ROLES : TEAM_ROLES.filter((r) => r !== "super_admin")).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-textMuted">Status</label>
                <select className="vs-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="pending_invite">pending_invite</option>
                </select>
              </div>
            </>
          ) : null}
          {localErr ? <p className="text-sm text-rose-300">{localErr}</p> : null}
          <div className="flex gap-2 pt-2">
            <button type="button" className="vs-button-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="vs-button-primary flex-1 justify-center disabled:opacity-50">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
