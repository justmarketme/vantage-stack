"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SystemsView } from "../../../../components/consultant/admin/SystemsView";
import { useMe } from "../../../../components/consultant/MeProvider";
import { buttonClass, PageHeader, Skeleton } from "../../../../components/consultant/ui";
import { can, NoAccess } from "../../../../components/consultant/wave2/parts";

/** Systems & Operations (needs `view_system_health`; the API re-checks). */
export default function AdminSystemsPage() {
  const { me } = useMe();
  return (
    <div>
      <Link href="/consultant/admin" className={buttonClass("ghost", "md", "-ml-3 mb-3")}>
        <ArrowLeft size={16} aria-hidden /> Admin
      </Link>
      <PageHeader title="Systems & Operations" subtitle="Is everything flowing? Red means a human is needed." />
      {!me ? <Skeleton className="h-[420px] rounded-2xl" /> : can(me, "view_system_health") ? <SystemsView /> : <NoAccess what="system health" />}
    </div>
  );
}
