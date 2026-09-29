"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Skeleton } from "../ui/Skeleton";
import { useSession } from "@/components/clinic-crm/providers/SessionProvider";
import { PageHeader } from "./PageHeader";
import { ThemeToggle } from "./ThemeToggle";

const ROLE_LABEL = { owner: "Owner", manager: "Practice manager", reception: "Reception" } as const;

export function SettingsView() {
  const { session, signOut } = useSession();

  return (
    <div className="cc-page max-w-[760px]">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="cc-muted mb-4 mt-1 text-sm">“System” follows your device’s light or dark setting.</p>
          <ThemeToggle showLabels />
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Your profile</h2>
          {session ? (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="cc-muted">Name</dt>
              <dd className="font-medium">{session.name}</dd>
              <dt className="cc-muted">Role</dt>
              <dd className="font-medium">{ROLE_LABEL[session.role]}</dd>
              <dt className="cc-muted">Clinic</dt>
              <dd className="font-medium">{session.clinicName}</dd>
            </dl>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          )}
          <Button className="mt-5" onClick={signOut} icon={<LogOut size={18} aria-hidden />}>
            Sign out
          </Button>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl cc-surface-2 cc-accent" aria-hidden>
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Patient privacy (POPIA)</h2>
              <p className="cc-muted mt-1 text-sm leading-relaxed">
                This system is built so your practice stays on the right side of the Protection of Personal Information Act.
              </p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed">
            <li>
              <strong>Consent first.</strong> A patient can only be registered once they’ve agreed to be contacted — we
              record who captured the consent and when.
            </li>
            <li>
              <strong>STOP means stop.</strong> If a patient replies STOP, UNSUBSCRIBE or OPT OUT, every automated and manual
              message to them is blocked immediately.
            </li>
            <li>
              <strong>Access and erasure.</strong> From any patient’s record, open “Privacy &amp; data” to export everything we
              hold on them or erase it permanently.
            </li>
          </ul>
          <div className="mt-3">
            <Disclosure label="What else is protected?">
              <ul className="cc-muted flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
                <li>Every view and change of a patient record is written to an audit log.</li>
                <li>Your clinic’s data is isolated from every other clinic on the platform.</li>
                <li>Patient details are never placed in web addresses, logs or error messages.</li>
                <li>WhatsApp messages outside the 24-hour window only use Meta-approved templates.</li>
              </ul>
            </Disclosure>
          </div>
        </Card>
      </div>
    </div>
  );
}
