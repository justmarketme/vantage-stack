import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { GuidedBlueprint } from "../../components/blueprint/GuidedBlueprint";
import { BlueprintHero } from "../../components/blueprint/BlueprintHero";
import { BlueprintAmbientAudio } from "../../components/blueprint/BlueprintAmbientAudio";
import { IsabelIntro } from "../../components/blueprint/IsabelIntro";

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
          <div className="vs-container space-y-10">
            <BlueprintHero />
            {/* Mobile-only Isabel presence — a lightweight poster band (the WebGL
                hologram is desktop-only). Keeps "a real host is here" on phones. */}
            <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#141518] to-[#0b0b0c] xl:hidden">
              <div className="relative">
                <img
                  src="/images/isabel-poster.jpg"
                  alt="Isabel, your VantageStack guide"
                  className="h-48 w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0c] via-transparent to-transparent" />
                <div className="absolute bottom-3 left-4 flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-sm font-semibold text-white">
                    Isabel <span className="font-normal text-textMuted">· your guide</span>
                  </p>
                </div>
              </div>
            </div>
            <div id="blueprint-deck" className="mx-auto max-w-2xl scroll-mt-24 xl:ml-8">
              <GuidedBlueprint schemaId={schemaId} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <BlueprintAmbientAudio />
      {/* Transparent lip-synced Isabel — welcomes on the hero CTA, then idles beside the form. */}
      <IsabelIntro className="pointer-events-none fixed bottom-0 right-0 z-30 hidden h-[88vh] w-[420px] xl:block" />
    </div>
  );
}
