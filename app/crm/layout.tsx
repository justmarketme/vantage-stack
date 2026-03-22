import type { ReactNode } from "react";
import { CrmSubnav } from "../../components/crm/CrmSubnav";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="vs-container pt-28 pb-16">
      <div className="max-w-6xl">
        <header className="mb-8">
          <h1 className="font-heading text-3xl tracking-tight text-textPrimary">CRM</h1>
          <div className="mt-6">
            <CrmSubnav />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
