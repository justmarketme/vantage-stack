import type { ReactNode } from "react";
import { CrmLayoutClient } from "../../components/crm/CrmLayoutClient";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <CrmLayoutClient>{children}</CrmLayoutClient>;
}
