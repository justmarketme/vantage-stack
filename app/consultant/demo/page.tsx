"use client";

import { useMemo } from "react";
import { Headphones } from "lucide-react";
import { DemoSandbox } from "../../../components/sandbox/DemoSandbox";
import { elevenLabsSandbox } from "../../../lib/sandbox/config";
import { useMe } from "../../../components/consultant/MeProvider";
import { PageHeader, SURFACE } from "../../../components/consultant/ui";
import { cx } from "../../../components/consultant/utils";
import { useOnline } from "../../../hooks/consultant/useOnline";

/**
 * Demo: let the clinic hear the AI agent answer as THEIR clinic. Reuses the
 * existing sandbox (components/sandbox/DemoSandbox.tsx) — never a fork — which
 * always runs against a separate sandbox agent, so demos can't spend
 * production minutes (see lib/sandbox/config.ts).
 *
 * When the sandbox agent isn't configured we don't show the operator panel
 * with env-var names to a consultant mid-demo; we say plainly that the demo
 * line isn't ready. Managers also see which setting is missing.
 */
export default function DemoPage() {
  const { me } = useMe();
  const online = useOnline();
  const el = useMemo(() => elevenLabsSandbox(), []);

  return (
    <div className="space-y-5">
      <PageHeader title="Demo" subtitle="Let the clinic hear their own front desk answer." />

      <div className={cx(SURFACE, "flex items-start gap-3 p-4")}>
        <Headphones size={18} aria-hidden className="mt-0.5 shrink-0 text-[--cp-coach]" />
        <p className="text-sm text-[--cp-text]">
          Put in the clinic&apos;s name and city, hand them the phone and let them call it like a client would. Then ask:{" "}
          <span className="text-[--cp-muted]">“How would it feel if every after-hours enquiry got that?”</span> — and book the next step before you leave.
        </p>
      </div>

      {!online ? (
        <div role="status" className={cx(SURFACE, "p-5")}>
          <p className="font-heading text-base text-[--cp-text]">You&apos;re offline</p>
          <p className="mt-1 text-sm text-[--cp-muted]">The live demo needs a connection. Hotspot from your phone and try again.</p>
        </div>
      ) : !el.ready ? (
        <div role="status" className={cx(SURFACE, "p-5")}>
          <p className="font-heading text-base text-[--cp-text]">The demo line isn&apos;t set up yet</p>
          <p className="mt-1 text-sm text-[--cp-muted]">
            Ask an admin to connect the sandbox voice agent. Until then, book the demo and run it with the team on the call.
          </p>
          {me?.isManager && (
            <p className="mt-3 rounded-xl bg-[--cp-surface-2] px-3 py-2 text-xs text-[--cp-muted]">
              For admins: {el.reason} <code className="text-[--cp-text]">{el.envVar}</code>
            </p>
          )}
        </div>
      ) : (
        <DemoSandbox />
      )}
    </div>
  );
}
