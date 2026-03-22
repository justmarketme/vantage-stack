import type { Sql } from "postgres";
import { ensureTeamTables } from "./members";
import type { TeamRole } from "../admin/roles";

export async function ensureSecurityTables(db: Sql) {
  await ensureTeamTables(db);
  await db.unsafe(`
    create table if not exists public.password_reset_tokens (
      id uuid primary key default gen_random_uuid(),
      token_hash text not null unique,
      member_id uuid not null references public.team_members(id) on delete cascade,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists password_reset_tokens_member_idx on public.password_reset_tokens (member_id);

    create table if not exists public.email_verify_tokens (
      id uuid primary key default gen_random_uuid(),
      token_hash text not null unique,
      member_id uuid not null references public.team_members(id) on delete cascade,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists public.crm_invitations (
      id uuid primary key default gen_random_uuid(),
      token_hash text not null unique,
      email text not null,
      username text not null,
      full_name text,
      role text not null,
      created_by uuid references public.team_members(id) on delete set null,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists crm_invitations_email_idx on public.crm_invitations (lower(email));

    create table if not exists public.auth_login_log (
      id uuid primary key default gen_random_uuid(),
      username_attempt text not null default '',
      email_attempt text,
      success boolean not null,
      member_id uuid references public.team_members(id) on delete set null,
      ip text,
      user_agent text,
      created_at timestamptz not null default now()
    );
    create index if not exists auth_login_log_created_idx on public.auth_login_log (created_at desc);
  `);
}

export async function logAuthLogin(
  db: Sql,
  input: {
    username_attempt: string;
    email_attempt?: string | null;
    success: boolean;
    member_id?: string | null;
    ip?: string | null;
    user_agent?: string | null;
  },
) {
  await ensureSecurityTables(db);
  await db`
    insert into public.auth_login_log (username_attempt, email_attempt, success, member_id, ip, user_agent)
    values (
      ${input.username_attempt},
      ${input.email_attempt ?? null},
      ${input.success},
      ${input.member_id ? input.member_id : null}::uuid,
      ${input.ip ?? null},
      ${input.user_agent ?? null}
    )
  `;
}

export async function insertPasswordResetToken(db: Sql, memberId: string, tokenHash: string, expiresAtIso: string) {
  await ensureSecurityTables(db);
  await db`delete from public.password_reset_tokens where member_id = ${memberId}::uuid and used_at is null`;
  await db`
    insert into public.password_reset_tokens (token_hash, member_id, expires_at)
    values (${tokenHash}, ${memberId}::uuid, ${expiresAtIso}::timestamptz)
  `;
}

export async function consumePasswordResetToken(
  db: Sql,
  tokenHash: string,
): Promise<{ member_id: string } | null> {
  await ensureSecurityTables(db);
  const rows = await db`
    select member_id::text
    from public.password_reset_tokens
    where token_hash = ${tokenHash}
      and used_at is null
      and expires_at > now()
    limit 1
  `;
  const row = rows[0] as { member_id?: string } | undefined;
  if (!row?.member_id) return null;
  await db`
    update public.password_reset_tokens
    set used_at = now()
    where token_hash = ${tokenHash} and used_at is null
  `;
  await db`delete from public.password_reset_tokens where token_hash = ${tokenHash}`;
  return { member_id: row.member_id };
}

export async function insertEmailVerifyToken(db: Sql, memberId: string, tokenHash: string, expiresAtIso: string) {
  await ensureSecurityTables(db);
  await db`delete from public.email_verify_tokens where member_id = ${memberId}::uuid and used_at is null`;
  await db`
    insert into public.email_verify_tokens (token_hash, member_id, expires_at)
    values (${tokenHash}, ${memberId}::uuid, ${expiresAtIso}::timestamptz)
  `;
}

export async function consumeEmailVerifyToken(db: Sql, tokenHash: string): Promise<{ member_id: string } | null> {
  await ensureSecurityTables(db);
  const rows = await db`
    select member_id::text
    from public.email_verify_tokens
    where token_hash = ${tokenHash}
      and used_at is null
      and expires_at > now()
    limit 1
  `;
  const row = rows[0] as { member_id?: string } | undefined;
  if (!row?.member_id) return null;
  await db`
    update public.email_verify_tokens set used_at = now()
    where token_hash = ${tokenHash} and used_at is null
  `;
  await db`delete from public.email_verify_tokens where token_hash = ${tokenHash}`;
  return { member_id: row.member_id };
}

export async function insertCrmInvitation(
  db: Sql,
  input: {
    tokenHash: string;
    email: string;
    username: string;
    fullName: string | null;
    role: TeamRole;
    createdBy: string | null;
    expiresAtIso: string;
  },
) {
  await ensureSecurityTables(db);
  const rows = await db`
    insert into public.crm_invitations (token_hash, email, username, full_name, role, created_by, expires_at)
    values (
      ${input.tokenHash},
      ${input.email.toLowerCase()},
      ${input.username},
      ${input.fullName},
      ${input.role},
      ${input.createdBy ? input.createdBy : null}::uuid,
      ${input.expiresAtIso}::timestamptz
    )
    returning id::text as id
  `;
  return (rows[0] as { id?: string })?.id ?? null;
}

export type CrmInvitationRow = {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: string;
  expires_at: string;
  created_by: string | null;
};

export async function getCrmInvitationByTokenHash(db: Sql, tokenHash: string): Promise<CrmInvitationRow | null> {
  await ensureSecurityTables(db);
  const rows = await db`
    select
      id::text,
      email::text,
      username::text,
      full_name::text,
      role::text,
      expires_at::text,
      created_by::text
    from public.crm_invitations
    where token_hash = ${tokenHash} and used_at is null
    limit 1
  `;
  return (rows[0] as CrmInvitationRow) ?? null;
}

export async function markCrmInvitationUsed(db: Sql, id: string) {
  await ensureSecurityTables(db);
  await db`update public.crm_invitations set used_at = now() where id = ${id}::uuid and used_at is null`;
}

export async function listPendingCrmInvitations(db: Sql) {
  await ensureSecurityTables(db);
  const rows = await db`
    select
      id::text,
      email::text,
      username::text,
      full_name::text,
      role::text,
      expires_at::text,
      created_at::text,
      created_by::text
    from public.crm_invitations
    where used_at is null and expires_at > now()
    order by created_at desc
  `;
  return rows as unknown as Array<{
    id: string;
    email: string;
    username: string;
    full_name: string | null;
    role: string;
    expires_at: string;
    created_at: string;
    created_by: string | null;
  }>;
}
