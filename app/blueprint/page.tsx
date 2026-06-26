import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { GuidedBlueprint } from "../../components/blueprint/GuidedBlueprint";
import { BlueprintAmbientAudio } from "../../components/blueprint/BlueprintAmbientAudio";
import { IsabelOverlay } from "../../components/blueprint/IsabelOverlay";

// The /blueprint page IS the guided, Isabel-led experience. Defaults to the
// public quick form; ?form=detailed renders the longer detailed schema (the
// same engine drives both).
export default async function BlueprintPage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>;
}) {
  const sp = await searchParams;
  const schemaId = sp?.form === "detailed" ? "detailed" : "quick";

  return (
    <div className="relative">
      <Navbar />
      <main className="pt-28">
        <section className="vs-section">
          <div className="vs-container">
            <div className="mx-auto max-w-2xl xl:ml-8">
              <GuidedBlueprint schemaId={schemaId} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <BlueprintAmbientAudio />
      <IsabelOverlay className="pointer-events-none fixed bottom-0 right-0 z-30 hidden h-[88vh] w-[420px] xl:block" />
    </div>
  );
}
