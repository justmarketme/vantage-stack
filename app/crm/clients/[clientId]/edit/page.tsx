"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientQuestionnaireForm } from "../../../../../components/crm/ClientQuestionnaireForm";
import type { QuestionnaireValues } from "../../../../../components/crm/ClientQuestionnaireForm";

function jsonListToText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("\n");
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = String(params.clientId ?? "");
  const [initial, setInitial] = useState<Partial<QuestionnaireValues> | null>(null);
  const [pipeline, setPipeline] = useState<{ status?: string; next_action?: string; assigned_to?: string }>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoadErr(null);
      try {
        const res = await fetch(`/api/crm/clients/${clientId}`, { credentials: "same-origin" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Not found");
        const p = json.profile;
        if (c || !p) return;
        setInitial({
          clientName: String(p.name ?? ""),
          company: p.company && String(p.company) !== String(p.name) ? String(p.company) : "",
          email: String(p.email ?? ""),
          whatsapp: String(p.whatsapp ?? ""),
          websiteUrl: String(p.website_url ?? ""),
          industry: String(p.industry ?? ""),
          revenueRange: String(p.revenue_range ?? ""),
          challenges: jsonListToText(p.challenges),
          competitors: jsonListToText(p.competitors),
          currentMarketing: String(p.current_marketing ?? ""),
          toolsUsed: jsonListToText(p.tools_used),
          monthlyBudget: String(p.monthly_budget ?? ""),
          successGoals: String(p.success_goals ?? ""),
        });
        setPipeline({
          status: String(p.status ?? ""),
          next_action: p.next_action ? String(p.next_action) : "",
          assigned_to: p.assigned_to ? String(p.assigned_to) : "",
        });
      } catch (e: unknown) {
        if (!c) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      c = true;
    };
  }, [clientId]);

  if (loadErr) {
    return (
      <p className="text-sm text-rose-300">
        {loadErr}{" "}
        <Link href="/crm/clients" className="text-sky-300 underline">
          Back to list
        </Link>
      </p>
    );
  }

  if (!initial) {
    return <p className="text-sm text-textMuted">Loading client…</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl text-textPrimary">Edit client</h2>
          <p className="text-sm text-textMuted mt-1">Changes are audited. Website URL changes trigger Agent 2 research when configured.</p>
        </div>
        <Link href={`/crm/clients/${clientId}`} className="vs-button-ghost text-sm">
          View profile
        </Link>
      </div>
      <ClientQuestionnaireForm
        key={clientId}
        mode="edit"
        initial={initial}
        initialPipeline={pipeline}
        submitLabel="Save changes"
        onSubmit={async (v, meta) => {
          if (meta.mode !== "edit") return;
          const res = await fetch(`/api/crm/clients/${clientId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              name: v.clientName,
              email: v.email,
              whatsapp: v.whatsapp,
              website_url: v.websiteUrl.trim() ? v.websiteUrl : null,
              industry: v.industry,
              revenue_range: v.revenueRange,
              challenges: v.challenges,
              competitors: v.competitors,
              current_marketing: v.currentMarketing,
              tools_used: v.toolsUsed,
              monthly_budget: v.monthlyBudget,
              success_goals: v.successGoals,
              company: v.company.trim() ? v.company : null,
              status: meta.status,
              next_action: meta.next_action.trim() ? meta.next_action : null,
              assigned_to: meta.assigned_to.trim() ? meta.assigned_to : null,
              changed_by: meta.changed_by,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Update failed");
          router.push(`/crm/clients/${clientId}`);
        }}
      />
    </div>
  );
}
