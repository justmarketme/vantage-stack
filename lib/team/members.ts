import type { Sql } from "postgres";
import { ensureCrmSchema } from "../crm/db";
import type { TeamRole } from "../admin/roles";
import { isTeamRole } from "../admin/roles";
import { randomBytes } from "crypto";

export type TeamMemberRow = {
  id: string;
  username: string;
  email: string;
  role: TeamRole;
  status: string;
  created_at: string;
  created_by: string | null;
  password_hash: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  full_name: string | null;
  email_verified_at: string | null;
  supabase_user_id: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  session_version: number;
};

const MEMBER_SELECT_SQL = `
  id::text,
  username::text,
  email::text,
  role::text,
  status::text,
  created_at::text,
  created_by::text,
  password_hash::text,
  invite_token::text,
  invite_expires_at::text,
  full_name::text,
  email_verified_at::text,
  supabase_user_id::text,
  coalesce(failed_login_attempts, 0)::int as failed_login_attempts,
  locked_until::text,
  last_login_at::text,
  coalesce(session_version, 0)::int as session_version
`;

function normalizeRow(r: Record<string, unknown>): TeamMemberRow | null {
  if (!isTeamRole(String(r.role))) return null;
  return {
    id: String(r.id),
    username: String(r.username),
    email: String(r.email),
    role: r.role as TeamRole,
    status: String(r.status),
    created_at: String(r.created_at),
    created_by: r.created_by ? String(r.created_by) : null,
    password_hash: r.password_hash != null ? String(r.password_hash) : null,
    invite_token: r.invite_token != null ? String(r.invite_token) : null,
    invite_expires_at: r.invite_expires_at != null ? String(r.invite_expires_at) : null,
    full_name: r.full_name != null ? String(r.full_name) : null,
    email_verified_at: r.email_verified_at != null ? String(r.email_verified_at) : null,
    supabase_user_id: r.supabase_user_id != null ? String(r.supabase_user_id) : null,
    failed_login_attempts: Number(r.failed_login_attempts ?? 0),
    locked_until: r.locked_until != null ? String(r.locked_until) : null,
    last_login_at: r.last_login_at != null ? String(r.last_login_at) : null,
    session_version: Number(r.session_version ?? 0),
  };
}

export async function ensureTeamTables(db: Sql) {
  await ensureCrmSchema(db);
  await db.unsafe(`
    create table if not exists public.team_members (
      id uuid primary key default gen_random_uuid(),
      username text not null,
      email text not null unique,
      password_hash text,
      role text not null,
      status text not null default 'active',
      invite_token text,
      invite_expires_at timestamptz,
      created_at timestamptz not null default now(),
      created_by uuid references public.team_members(id) on delete set null
    );
    create index if not exists team_members_status_idx on public.team_members (status);
    create index if not exists team_members_invite_token_idx on public.team_members (invite_token) where invite_token is not null;
  `);
  await db.unsafe(`
    alter table public.team_members add column if not exists full_name text;
    alter table public.team_members add column if not exists email_verified_at timestamptz;
    alter table public.team_members add column if not exists supabase_user_id text;
    alter table public.team_members add column if not exists failed_login_attempts int not null default 0;
    alter table public.team_members add column if not exists locked_until timestamptz;
    alter table public.team_members add column if not exists last_login_at timestamptz;
    alter table public.team_members add column if not exists session_version int not null default 0;
  `);
  await db.unsafe(`
    create unique index if not exists team_members_username_lower_idx on public.team_members (lower(username));
  `);
  await db.unsafe(`
    create table if not exists public.team_activity_log (
      id uuid primary key default gen_random_uuid(),
      member_id uuid references public.team_members(id) on delete set null,
      actor_username text not null default '',
      action_type text not null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists team_activity_log_created_idx on public.team_activity_log (created_at desc);
    create index if not exists team_activity_log_member_idx on public.team_activity_log (member_id, created_at desc);
  `);
}

export async function countTeamMembers(db: Sql): Promise<number> {
  await ensureTeamTables(db);
  const r = await db`select count(*)::int as n from public.team_members`;
  return Number((r[0] as { n?: number })?.n ?? 0);
}

export async function countActiveSuperAdmins(db: Sql): Promise<number> {
  await ensureTeamTables(db);
  const r = await db`
    select count(*)::int as n from public.team_members
    where role = 'super_admin' and status = 'active'
  `;
  return Number((r[0] as { n?: number })?.n ?? 0);
}

export async function listTeamMembers(db: Sql): Promise<TeamMemberRow[]> {
  await ensureTeamTables(db);
  const rows = await db.unsafe(
    `
    select ${MEMBER_SELECT_SQL}
    from public.team_members
    order by created_at asc
  `,
  );
  return (rows as Record<string, unknown>[]).map(normalizeRow).filter((x): x is TeamMemberRow => x != null);
}

export async function getMemberByEmail(db: Sql, email: string): Promise<TeamMemberRow | null> {
  await ensureTeamTables(db);
  const rows = await db`
    select
      id::text,
      username::text,
      email::text,
      role::text,
      status::text,
      created_at::text,
      created_by::text,
      password_hash::text,
      invite_token::text,
      invite_expires_at::text,
      full_name::text,
      email_verified_at::text,
      supabase_user_id::text,
      coalesce(failed_login_attempts, 0)::int as failed_login_attempts,
      locked_until::text,
      last_login_at::text,
      coalesce(session_version, 0)::int as session_version
    from public.team_members
    where lower(email) = lower(${email})
    limit 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  return r ? normalizeRow(r) : null;
}

export async function getMemberByUsername(db: Sql, username: string): Promise<TeamMemberRow | null> {
  await ensureTeamTables(db);
  const rows = await db`
    select
      id::text,
      username::text,
      email::text,
      role::text,
      status::text,
      created_at::text,
      created_by::text,
      password_hash::text,
      invite_token::text,
      invite_expires_at::text,
      full_name::text,
      email_verified_at::text,
      supabase_user_id::text,
      coalesce(failed_login_attempts, 0)::int as failed_login_attempts,
      locked_until::text,
      last_login_at::text,
      coalesce(session_version, 0)::int as session_version
    from public.team_members
    where lower(username) = lower(${username})
    limit 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  return r ? normalizeRow(r) : null;
}

export async function getMemberById(db: Sql, id: string): Promise<TeamMemberRow | null> {
  await ensureTeamTables(db);
  const rows = await db.unsafe(
    `
    select ${MEMBER_SELECT_SQL}
    from public.team_members
    where id = $1::uuid
    limit 1
  `,
    [id],
  );
  const r = (rows as Record<string, unknown>[])[0];
  return r ? normalizeRow(r) : null;
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function insertTeamMember(
  db: Sql,
  input: {
    username: string;
    email: string;
    role: TeamRole;
    password_hash: string | null;
    created_by: string | null;
    invite_token?: string | null;
    invite_expires_at?: string | null;
    status?: "active" | "inactive" | "pending_invite";
    full_name?: string | null;
    supabase_user_id?: string | null;
    email_verified_at?: string | null;
  },
) {
  await ensureTeamTables(db);
  const st = input.status ?? (input.password_hash ? "active" : "pending_invite");
  const rows = await db`
    insert into public.team_members (
      username, email, role, password_hash, created_by, invite_token, invite_expires_at, status,
      full_name, supabase_user_id, email_verified_at
    )
    values (
      ${input.username},
      ${input.email.toLowerCase()},
      ${input.role},
      ${input.password_hash},
      ${input.created_by ? input.created_by : null}::uuid,
      ${input.invite_token ?? null},
      ${input.invite_expires_at ? input.invite_expires_at : null}::timestamptz,
      ${st},
      ${input.full_name ?? null},
      ${input.supabase_user_id ?? null},
      ${input.email_verified_at ? input.email_verified_at : null}::timestamptz
    )
    returning id::text as id
  `;
  return (rows[0] as { id?: string })?.id ?? null;
}

export async function logTeamAction(
  db: Sql,
  input: { member_id?: string | null; actor_username: string; action_type: string; details?: Record<string, unknown> },
) {
  await ensureTeamTables(db);
  await db`
    insert into public.team_activity_log (member_id, actor_username, action_type, details)
    values (
      ${input.member_id ? input.member_id : null}::uuid,
      ${input.actor_username},
      ${input.action_type},
      ${JSON.stringify(input.details ?? {})}::jsonb
    )
  `;
}

export async function updateMember(
  db: Sql,
  id: string,
  patch: Partial<{
    username: string;
    email: string;
    role: TeamRole;
    status: string;
    password_hash: string | null;
    full_name: string | null;
    email_verified_at: string | null;
    last_login_at: string | null;
    locked_until: string | null;
    failed_login_attempts: number;
    session_version: number;
    supabase_user_id: string | null;
  }>,
) {
  await ensureTeamTables(db);
  const cur = await getMemberById(db, id);
  if (!cur) return false;
  const emailVerified =
    patch.email_verified_at !== undefined ? patch.email_verified_at : cur.email_verified_at;
  const lastLogin = patch.last_login_at !== undefined ? patch.last_login_at : cur.last_login_at;
  const lockedUntil = patch.locked_until !== undefined ? patch.locked_until : cur.locked_until;

  await db`
    update public.team_members set
      username = ${patch.username ?? cur.username},
      email = ${(patch.email ?? cur.email).toLowerCase()},
      role = ${patch.role ?? cur.role},
      status = ${patch.status ?? cur.status},
      password_hash = ${patch.password_hash !== undefined ? patch.password_hash : cur.password_hash},
      full_name = ${patch.full_name !== undefined ? patch.full_name : cur.full_name},
      email_verified_at = ${emailVerified},
      last_login_at = ${lastLogin},
      locked_until = ${lockedUntil},
      failed_login_attempts = ${patch.failed_login_attempts !== undefined ? patch.failed_login_attempts : cur.failed_login_attempts},
      session_version = ${patch.session_version !== undefined ? patch.session_version : cur.session_version},
      supabase_user_id = ${patch.supabase_user_id !== undefined ? patch.supabase_user_id : cur.supabase_user_id}
    where id = ${id}::uuid
  `;
  return true;
}

export async function bumpSessionVersion(db: Sql, id: string) {
  await ensureTeamTables(db);
  await db`
    update public.team_members
    set session_version = coalesce(session_version, 0) + 1
    where id = ${id}::uuid
  `;
}

export async function deleteMemberHard(db: Sql, id: string) {
  await ensureTeamTables(db);
  await db`delete from public.team_members where id = ${id}::uuid`;
}

export async function getMemberByInviteToken(db: Sql, token: string) {
  await ensureTeamTables(db);
  const rows = await db`
    select id::text, username::text, email::text, invite_expires_at::text
    from public.team_members
    where invite_token = ${token} and status = 'pending_invite'
    limit 1
  `;
  return rows[0] as { id: string; username: string; email: string; invite_expires_at: string } | undefined;
}

export async function acceptInviteSetPassword(db: Sql, memberId: string, password_hash: string) {
  await ensureTeamTables(db);
  await db`
    update public.team_members set
      password_hash = ${password_hash},
      invite_token = null,
      invite_expires_at = null,
      status = 'active'
    where id = ${memberId}::uuid
  `;
}

export async function fetchMemberActivity(db: Sql, username: string, limit = 100) {
  await ensureTeamTables(db);
  const crm = await db`
    select action_type::text, user_actor::text, created_at::text, details, 'crm' as source
    from public.crm_activity
    where user_actor = ${username}
    order by created_at desc
    limit ${limit}
  `;
  const team = await db`
    select action_type::text, actor_username::text, created_at::text, details, 'team' as source
    from public.team_activity_log
    where actor_username = ${username}
    order by created_at desc
    limit ${limit}
  `;
  const merged = [...(crm as unknown[]), ...(team as unknown[])] as Array<Record<string, unknown>>;
  merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return merged.slice(0, limit);
}
