import { DemoSandbox } from "../../components/sandbox/DemoSandbox";

export default function SandboxPage() {
  return (
    <main className="vs-section">
      <div className="vs-container">
        <span className="vs-badge">Internal</span>
        <h1 className="vs-section-title mt-5 max-w-2xl">Live demo sandbox</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-textMuted">
          Pick a persona, drop in the prospect&rsquo;s own business name, and let them hear their
          business answer the phone. Runs against a sandbox agent, so a demo never spends
          production minutes.
        </p>

        <div className="mt-10">
          <DemoSandbox />
        </div>
      </div>
    </main>
  );
}
