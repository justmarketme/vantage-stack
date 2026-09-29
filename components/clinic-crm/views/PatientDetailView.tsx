"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BASE } from "./AppShell";
import { PatientRecord } from "./PatientRecord";

export function PatientDetailView({ id }: { id: string }) {
  const router = useRouter();
  return (
    <div className="cc-page max-w-[760px]">
      <Link href={`${BASE}/patients`} className="cc-btn cc-btn-ghost cc-btn-sm -ml-3 mb-4">
        <ArrowLeft size={16} aria-hidden /> Patients
      </Link>
      <div className="cc-card p-5 md:p-7">
        <PatientRecord id={id} onErased={() => router.replace(`${BASE}/patients`)} />
      </div>
    </div>
  );
}
