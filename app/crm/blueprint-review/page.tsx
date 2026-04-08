"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Client = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  industry?: string;
  created_at: string;
  next_action?: string;
  website_url?: string;
  has_blueprint?: boolean;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function BlueprintReviewPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/clients?status=blueprint-submitted&per_page=100", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok && data.error) throw new Error(data.error);
        setClients(data.clients ?? []);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Blueprint Review</h1>
          <p className="text-sm text-textMuted mt-1">
            {loading ? "Loading…" : `${clients.length} blueprint${clients.length !== 1 ? "s" : ""} awaiting review`}
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-purple-400 text-xl">📋</span>
          <div>
            <p className="text-sm font-semibold text-purple-200">How Blueprint Review Works</p>
            <p className="text-xs text-textMuted mt-1">
              When a prospect completes the intake questionnaire, their blueprint is automatically generated and appears here ready to review. You can edit the blueprint, run additional research, then send it to the client.
            </p>
          </div>
        </div>
      </div>

      {err && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">{err}</div>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-textMuted py-8">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          Loading…
        </div>
      )}

      {!loading && clients.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#16161A] py-20 text-center">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-sm font-semibold text-textPrimary">No blueprints pending</p>
          <p className="text-xs text-textMuted mt-1">When prospects complete the intake form, they'll appear here for review.</p>
        </div>
      )}

      {!loading && clients.length > 0 && (
        <div className="grid gap-4">
          {clients.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5 hover:border-purple-500/30 transition-all">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 font-bold text-sm">
                  {initials(c.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-textPrimary">{c.name}</span>
                    <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple-300">
                      Blueprint Submitted
                    </span>
                    {c.has_blueprint && (
                      <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-300">
                        Blueprint Ready
                      </span>
                    )}
                    <span className="text-xs text-textMuted">{timeAgo(c.created_at)}</span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-textMuted sm:grid-cols-4">
                    {c.company && (
                      <div><span className="text-textMuted/50">Company:</span> <span className="text-textPrimary/80">{c.company}</span></div>
                    )}
                    {c.industry && (
                      <div><span className="text-textMuted/50">Industry:</span> <span className="text-textPrimary/80">{c.industry}</span></div>
                    )}
                    {c.email && (
                      <div><span className="text-textMuted/50">Email:</span> <span className="text-textPrimary/80">{c.email}</span></div>
                    )}
                    {c.website_url && (
                      <div className="truncate"><span className="text-textMuted/50">Website:</span>{" "}
                        <a href={c.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">{c.website_url.replace(/^https?:\/\//, "")}</a>
                      </div>
                    )}
                  </div>

                  {c.next_action && (
                    <div className="mt-2 text-xs text-amber-300/80">⚡ {c.next_action}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Link
                    href={`/crm/blueprint-review/${c.id}`}
                    className="rounded-lg bg-purple-500/20 border border-purple-500/30 px-4 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-500/30 transition text-center whitespace-nowrap"
                  >
                    {c.has_blueprint ? "Review Blueprint" : "Review & Generate"}
                  </Link>
                  <Link
                    href={`/crm/clients/${c.id}`}
                    className="rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-textMuted hover:bg-white/10 transition text-center"
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
