import { SandboxStudio } from "../../components/sandbox/SandboxStudio";

export default function SandboxPage() {
  return (
    <main className="vs-section">
      <div className="vs-container">
        <span className="vs-badge">Internal</span>
        <h1 className="vs-section-title mt-5 max-w-2xl">Sandbox studio</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-textMuted">
          Pick a persona, drop in the prospect&rsquo;s own business name, choose a voice, and let
          them hear their business answer the phone &mdash; by voice or text. Every change is a
          per-session override on a sandbox agent; nothing is saved to ElevenLabs.
        </p>

        <div className="mt-10">
          <SandboxStudio />
        </div>
      </div>
    </main>
  );
}
