import type { Metadata } from "next";
import { ServiceIntakeForm } from "../../components/blueprint/ServiceIntakeForm";

export const metadata: Metadata = {
  title: "Quick-Start Services | The VantageStack Team",
  description: "Get started with a targeted Quick-Start service — GMB setup, WhatsApp automation, lead routing, or follow-up systems.",
};

const SERVICES = [
  {
    key: "gmb" as const,
    icon: "📍",
    title: "Google My Business Setup",
    description: "Get your Google Business Profile fully optimised and ranking for local searches.",
  },
  {
    key: "whatsapp_automation" as const,
    icon: "💬",
    title: "WhatsApp Automation",
    description: "Automate lead capture, follow-ups, and appointment booking via WhatsApp.",
  },
  {
    key: "lead_routing" as const,
    icon: "🔀",
    title: "Lead Routing",
    description: "Intelligently route and assign incoming leads so no opportunity falls through the cracks.",
  },
  {
    key: "follow_up" as const,
    icon: "🔁",
    title: "Follow-Up Systems",
    description: "Set up automated follow-up sequences that nurture leads until they're ready to buy.",
  },
] as const;

export default function QuickStartPage({
  searchParams,
}: {
  searchParams: { service?: string };
}) {
  const selected = SERVICES.find((s) => s.key === searchParams.service);

  if (selected) {
    return (
      <main className="min-h-screen bg-bgPrimary px-4 py-12 md:py-20">
        <div className="mx-auto max-w-2xl">
          <ServiceIntakeForm
            serviceInterest={selected.key}
            subCopy={selected.description}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bgPrimary px-4 py-12 md:py-20">
      <div className="mx-auto max-w-3xl space-y-10">
        <div className="text-center space-y-3">
          <p className="vs-section-heading">Quick-Start Services</p>
          <h1 className="font-heading text-3xl md:text-4xl text-textPrimary">Which service do you need?</h1>
          <p className="text-textMuted max-w-xl mx-auto">
            Pick the service that matches what you need right now. We'll reach out within 24 hours to get things moving.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <a
              key={s.key}
              href={`/quick-start?service=${s.key}`}
              className="group rounded-xl border border-white/[0.08] bg-[#16161A] p-6 hover:border-accent/40 hover:bg-white/[0.03] transition-all flex flex-col gap-3"
            >
              <span className="text-3xl">{s.icon}</span>
              <div>
                <h2 className="font-semibold text-textPrimary group-hover:text-accent transition">{s.title}</h2>
                <p className="text-sm text-textMuted mt-1">{s.description}</p>
              </div>
              <span className="mt-auto text-xs font-semibold text-accent">Get started →</span>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
