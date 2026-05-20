import type { Metadata } from "next";
import { ServiceIntakeForm } from "../../components/blueprint/ServiceIntakeForm";

export const metadata: Metadata = {
  title: "Pricing Inquiry | The VantageStack Team",
  description: "Tell us about your business and we'll send you a tailored pricing breakdown.",
};

export default function PricingInquiryPage() {
  return (
    <main className="min-h-screen bg-bgPrimary px-4 py-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        <ServiceIntakeForm
          serviceInterest="full_service"
          heading="Get a tailored pricing breakdown"
          subCopy="Fill in a few details about your business and we'll send you a personalised pricing breakdown within 24 hours — no obligation."
        />
      </div>
    </main>
  );
}
