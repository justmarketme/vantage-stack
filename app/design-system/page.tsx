import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { loadDesignTokens } from "../../lib/design-system/tokens";
import { listUiComponentFiles } from "../../lib/design-system/list-ui-components";

function canViewDesignSystem(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_DESIGN_SYSTEM_VIEWER === "1";
}

export const metadata = {
  title: "Design system — VantageStack",
  description: "Internal viewer for VantageStack design tokens and component library.",
};

export default async function DesignSystemPage() {
  if (!canViewDesignSystem()) {
    notFound();
  }

  const [tokens, uiFiles] = await Promise.all([loadDesignTokens(), listUiComponentFiles()]);

  const colors = tokens.colors ?? {};
  const scale = tokens.typography?.scale ?? {};
  const headingFonts = tokens.typography?.fontFamily?.heading?.join(", ") ?? "Space Grotesk";
  const bodyFonts = tokens.typography?.fontFamily?.body?.join(", ") ?? "Inter";
  const preferredDir = tokens.componentLibrary?.preferredSubdir ?? "components/ui";

  const mcpTools = [
    "validate-brand-consistency",
    "apply-color-palette",
    "ensure-typography-standards",
    "access-component-library",
    "check-responsive-design",
    "validate-accessibility-standards",
    "ensure-dark-mode-compatibility",
  ];

  return (
    <div className="relative min-h-screen bg-background font-body text-textPrimary">
      <Navbar />

      <main className="pt-28">
        <section className="vs-section border-b border-white/10">
          <div className="vs-container">
            <p className="vs-section-heading">Internal · Design system</p>
            <h1 className="vs-section-title font-heading text-textPrimary">
              {tokens.brand?.name ?? "van-tij-stack"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-textMuted md:text-base">
              {tokens.brand?.positioning ??
                "Premium, world-class, system-led growth partner."}{" "}
              This page mirrors <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-textMuted">mcp/design-system/tokens.json</code>{" "}
              and lists reusable UI under <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-textMuted">{preferredDir}</code>.
            </p>
            <p className="mt-4 text-xs text-textMuted">
              Local URL:{" "}
              <span className="text-textPrimary/90">http://localhost:3005/design-system</span>
              {" · "}
              Production: set{" "}
              <code className="rounded bg-white/5 px-1 py-0.5 text-[11px]">NEXT_PUBLIC_DESIGN_SYSTEM_VIEWER=1</code> to enable.
            </p>
          </div>
        </section>

        <section className="vs-section">
          <div className="vs-container">
            <h2 className="vs-section-heading">Palette</h2>
            <h3 className="vs-section-title font-heading">Color tokens</h3>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(colors).map(([name, hex]) => (
                <div key={name} className="vs-card vs-card-hover overflow-hidden p-0">
                  <div className="h-24 w-full" style={{ backgroundColor: hex }} aria-hidden />
                  <div className="border-t border-white/10 px-5 py-4">
                    <p className="font-heading text-sm text-textPrimary">{name}</p>
                    <p className="mt-1 font-mono text-xs text-textMuted">{hex}</p>
                    <p className="mt-2 text-[11px] text-textMuted">
                      Tailwind:{" "}
                      <code className="rounded bg-white/5 px-1">
                        {name === "textPrimary" || name === "textMuted"
                          ? `text-${name}`
                          : `bg-${name}`}
                      </code>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="vs-section border-t border-white/10">
          <div className="vs-container">
            <h2 className="vs-section-heading">Typography</h2>
            <h3 className="vs-section-title font-heading">Fonts & scale</h3>
            <div className="mt-8 vs-grid">
              <div className="vs-card space-y-4">
                <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Heading</p>
                <p className="font-heading text-2xl leading-tight md:text-3xl" style={{ fontFamily: headingFonts }}>
                  Space Grotesk for titles
                </p>
                <p className="text-xs text-textMuted">Class: <code className="rounded bg-white/5 px-1">font-heading</code></p>
              </div>
              <div className="vs-card space-y-4">
                <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Body</p>
                <p className="font-body text-base leading-relaxed text-textMuted" style={{ fontFamily: bodyFonts }}>
                  Inter for UI and long-form copy. Keep contrast high on <span className="text-textPrimary">background</span> and use{" "}
                  <span className="text-textMuted">textMuted</span> for secondary lines.
                </p>
                <p className="text-xs text-textMuted">Class: <code className="rounded bg-white/5 px-1">font-body</code></p>
              </div>
            </div>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-textMuted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Token</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(scale).map(([k, v]) => (
                    <tr key={k} className="border-b border-white/5">
                      <td className="px-4 py-3 font-mono text-xs text-textMuted">{k}</td>
                      <td className="px-4 py-3 font-mono text-xs text-textPrimary">{v}</td>
                      <td className="px-4 py-3 font-heading" style={{ fontSize: v }}>
                        Aa — The quick brown fox
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="vs-section border-t border-white/10">
          <div className="vs-container">
            <h2 className="vs-section-heading">Primitives</h2>
            <h3 className="vs-section-title font-heading">CSS utilities · globals.css</h3>
            <div className="mt-8 flex flex-wrap gap-3">
              {["vs-container", "vs-section", "vs-card", "vs-button-primary", "vs-button-ghost", "vs-input", "vs-badge", "vs-grid"].map(
                (c) => (
                  <span key={c} className="vs-badge font-mono text-[10px] normal-case tracking-normal text-textPrimary/90">
                    .{c}
                  </span>
                ),
              )}
            </div>
            <div className="mt-10 vs-grid">
              <div className="vs-card">
                <p className="text-xs text-textMuted">Card</p>
                <p className="mt-2 font-heading text-lg">Premium surface</p>
                <p className="mt-2 text-sm text-textMuted">Border, blur, subtle gradient.</p>
              </div>
              <div className="flex flex-col gap-3">
                <button type="button" className="vs-button-primary focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent/70">
                  Primary
                </button>
                <button type="button" className="vs-button-ghost focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/30">
                  Ghost
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="vs-section border-t border-white/10">
          <div className="vs-container">
            <h2 className="vs-section-heading">Motion & a11y</h2>
            <h3 className="vs-section-title font-heading">Tokens from JSON</h3>
            <div className="mt-8 vs-grid">
              <div className="vs-card">
                <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Radius</p>
                <ul className="mt-3 space-y-2 text-sm text-textMuted">
                  {Object.entries(tokens.radius ?? {}).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-mono text-textPrimary">{k}</span> — {v}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="vs-card">
                <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Accessibility</p>
                <ul className="mt-3 space-y-2 text-sm text-textMuted">
                  <li>
                    Min tap target:{" "}
                    <span className="text-textPrimary">{tokens.accessibility?.minTapTargetPx ?? 44}px</span>
                  </li>
                  <li>
                    Focus visible:{" "}
                    <span className="text-textPrimary">
                      {tokens.accessibility?.focusVisibleRequired ? "required" : "optional"}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="vs-section border-t border-white/10">
          <div className="vs-container">
            <h2 className="vs-section-heading">Component library</h2>
            <h3 className="vs-section-title font-heading">{preferredDir}</h3>
            <p className="mt-3 max-w-2xl text-sm text-textMuted">
              Files discovered on disk. Add new reusable pieces here so the design-system MCP and other agents can find them.
            </p>
            <ul className="mt-6 space-y-2">
              {uiFiles.length === 0 ? (
                <li className="text-sm text-textMuted">No components yet — create files in {preferredDir}/</li>
              ) : (
                uiFiles.map((f) => (
                  <li key={f}>
                    <code className="rounded bg-white/5 px-2 py-1 text-xs text-accent">{f}</code>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        <section className="vs-section border-t border-white/10 pb-8">
          <div className="vs-container">
            <h2 className="vs-section-heading">MCP</h2>
            <h3 className="vs-section-title font-heading">design-system tools</h3>
            <p className="mt-3 max-w-2xl text-sm text-textMuted">
              Run <code className="rounded bg-white/5 px-1 text-xs">npm run mcp:design-system</code> in Cursor and pass component source through these tools before shipping UI.
            </p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {mcpTools.map((t) => (
                <li key={t} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-xs text-textPrimary">
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-8">
              <Link href="/" className="text-sm text-accent hover:text-accent/90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent/60">
                ← Back to home
              </Link>
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
