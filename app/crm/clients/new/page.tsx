"use client";

import { useRouter } from "next/navigation";
import { ClientQuestionnaireForm } from "../../../../components/crm/ClientQuestionnaireForm";

export default function NewClientPage() {
  const router = useRouter();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-heading text-xl text-textPrimary">Add new client</h2>
        <p className="text-sm text-textMuted mt-1">Same fields as the public blueprint questionnaire. Stored as manually-added unless you jump stages.</p>
      </div>
      <ClientQuestionnaireForm
        mode="create"
        submitLabel="Create client"
        onSubmit={async (v, meta) => {
          if (meta.mode !== "create") return;
          const body = {
            clientName: v.clientName,
            email: v.email,
            whatsapp: v.whatsapp,
            websiteUrl: v.websiteUrl,
            industry: v.industry,
            revenueRange: v.revenueRange,
            challenges: v.challenges,
            competitors: v.competitors,
            currentMarketing: v.currentMarketing,
            toolsUsed: v.toolsUsed,
            monthlyBudget: v.monthlyBudget,
            successGoals: v.successGoals,
            company: v.company,
            intake_source: "crm_manual" as const,
            created_by: meta.createdBy,
            skip_research: meta.skipResearch,
            jump_to_status: meta.jumpToStatus || undefined,
          };
          const res = await fetch("/api/crm/client/intake", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Intake failed");
          router.push(`/crm/clients/${json.client_id}`);
        }}
      />
    </div>
  );
}
