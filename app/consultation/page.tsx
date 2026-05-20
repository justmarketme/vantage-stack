import type { Metadata } from "next";
import { ServiceIntakeForm } from "../../components/blueprint/ServiceIntakeForm";

export const metadata: Metadata = {
  title: "Book a Consultation | The VantageStack Team",
  description: "Book a free strategy consultation with The VantageStack Team.",
};

export default function ConsultationPage() {
  return (
    <main className="min-h-screen bg-bgPrimary px-4 py-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        <ServiceIntakeForm
          serviceInterest="full_service"
          heading="Book a free strategy consultation"
          subCopy="Tell us about your business and we'll schedule a call to walk you through exactly how we'd grow your revenue — no sales pitch, just a straight conversation."
        />
      </div>
    </main>
  );
}
