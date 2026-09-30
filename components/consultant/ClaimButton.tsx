"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { api } from "../../lib/consultant/client/api";
import { useOnline } from "../../hooks/consultant/useOnline";
import { invalidateQueries } from "../../hooks/consultant/useQuery";
import type { Lead } from "../../lib/consultant/types";
import { Button } from "./ui";
import { describeError } from "./utils";

/** Take an unassigned lead from the pool. Needs a connection (it's a race with other reps). */
export function ClaimButton({ lead, onClaimed }: { lead: Pick<Lead, "id" | "clinicName">; onClaimed?: (l: Lead) => void }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const l = await api.leads.claim(lead.id);
      onClaimed?.(l);
      void invalidateQueries("leads:");
      void invalidateQueries("stats:");
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="secondary"
        onClick={claim}
        disabled={busy || !online}
        title={online ? `Claim ${lead.clinicName}` : "Claiming needs a connection"}
        aria-label={`Claim ${lead.clinicName}`}
      >
        <Hand size={16} aria-hidden /> {busy ? "Claiming…" : "Claim"}
      </Button>
      {error && (
        <p role="alert" className="mt-1 max-w-[14rem] text-right text-xs text-[--cp-risk]">
          {error}
        </p>
      )}
    </div>
  );
}
