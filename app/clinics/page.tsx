"use client";

import { useState } from "react";
import Image from "next/image";
import { RevenueJourney } from "../../components/clinics/RevenueJourney";
import { BrokenJourney } from "../../components/clinics/BrokenJourney";
import { SystemMachine } from "../../components/clinics/SystemMachine";
import { LiveSystemDemo } from "../../components/clinics/LiveSystemDemo";
import { RoiCalculator } from "../../components/clinics/RoiCalculator";
import { ClinicBlueprintForm } from "../../components/clinics/ClinicBlueprintForm";
import { ClinicsNav } from "../../components/clinics/ClinicsNav";
import type { RoiResult } from "../../lib/clinics/schema";

/**
 * clinics.vantagestack.co.za
 *
 * One argument, in order: the worry a clinic owner already has → what is
 * actually causing it → what changes → the machine that changes it → proof it
 * runs → their own number → how it gets installed → the blueprint.
 *
 * Each section is written to earn the next. Nothing here is a feature block
 * that could be moved without breaking the argument, and the page deliberately
 * has ONE conversion point rather than a CTA after every scroll.
 */

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className = "",
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    // scroll-mt clears the fixed pill header when an in-page anchor jumps here;
      // without it every "#roi" style link lands with the heading tucked behind
      // the nav.
      <section id={id} className={`vs-section scroll-mt-24 md:scroll-mt-28 ${className}`}>
      <div className="vs-container">
        <p className="vs-section-heading">{eyebrow}</p>
        <h2 className="vs-section-title max-w-3xl">{title}</h2>
        {lead && (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-textMuted">{lead}</p>
        )}
        {children && <div className="mt-10 md:mt-12">{children}</div>}
      </div>
    </section>
  );
}

export default function ClinicsPage() {
  // Lifted so the blueprint form can carry the exact figures the visitor saw.
  const [roi, setRoi] = useState<RoiResult | null>(null);

  return (
    <main>
      <ClinicsNav />

      {/* ── Hero ───────────────────────────────────────────── */}
      {/* Top padding clears the fixed pill header at both breakpoints. */}
      <section className="relative overflow-hidden pb-16 pt-28 md:pb-20 md:pt-36">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]"
        />
        <div className="vs-container relative">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="vs-badge">For private practices in South Africa</span>

              <h1 className="mt-6 font-heading text-[34px] leading-[1.1] md:text-[52px] md:leading-[1.05]">
                Your clinic doesn&rsquo;t need another website.
                <span className="mt-2 block text-accent">It needs a revenue system.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-textMuted md:text-lg">
                A new site makes the phone ring. It does not answer at 19:42, hold the slot, confirm
                the chair, or bring anyone back six months later. Those are the four places the
                money actually goes — and they are operations, not design.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#blueprint" className="vs-button-primary">
                  Book a demo
                </a>
                <a href="#roi" className="vs-button-ghost">
                  See what it recovers
                </a>
              </div>

              <p className="mt-5 text-xs leading-relaxed text-textMuted">
                Built around your reception team, not instead of them.
              </p>
            </div>

            {/* Real clinic imagery grounds the claim; the product visual sits
                over it. The photograph is darkened hard so it reads as context
                rather than stock decoration, and so the only saturated thing in
                the frame remains the live journey. */}
            <div className="relative">
              <div className="relative overflow-hidden rounded-3xl border border-white/10">
                <Image
                  src="/images/clinics/hero-reception.jpeg"
                  alt="A receptionist at the front desk of a private dental practice after hours."
                  width={1800}
                  height={1005}
                  priority
                  sizes="(max-width: 1024px) 100vw, 46vw"
                  // The generated scene is deliberately low-key, which makes it
                  // vanish against a #0B0B0C page. Lifting it here rather than
                  // regenerating keeps the mood while making the room, the desk
                  // and the person actually readable — the imagery has to be
                  // visible to be worth having.
                  className="h-[360px] w-full object-cover brightness-[1.45] contrast-[1.08] saturate-[0.9] md:h-[460px]"
                />
                {/* Scrim weighted to the BOTTOM THIRD only — just enough to seat
                    the card, while the upper two-thirds of the photograph stay
                    legible. An even wash across the whole image turns real
                    clinic imagery into texture, which defeats the point of
                    shooting a real scene at all. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(to_top,#0B0B0C_0%,rgba(11,11,12,0.55)_28%,rgba(11,11,12,0)_60%)]"
                />
              </div>

              <div className="relative -mt-20 px-2 md:-mt-24 md:px-4">
                <RevenueJourney />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem ────────────────────────────────────────── */}
      <Section
        id="problem"
        eyebrow="The problem"
        title="The parts are all there. The connections are not."
        lead={
          <>
            Most practices are not missing a tool. They have a phone, a diary, a website and a team
            that cares. What they do not have is anything joining those together — so an enquiry
            has to survive five separate handoffs, and at every gap some of them do not.
          </>
        }
      >
        {/* The photograph carries the feeling the copy argues for — a desk with
            nobody at it and a phone still going. Muted to near-monochrome so the
            problem section stays colourless; blue only arrives once the system
            does. */}
        <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10">
          <Image
            src="/images/clinics/problem-empty-desk.jpeg"
            alt="An empty clinic reception desk at lunchtime, with a phone and an open appointment book."
            width={1800}
            height={1005}
            sizes="(max-width: 768px) 100vw, 90vw"
            className="h-[240px] w-full object-cover brightness-[1.3] saturate-[0.55] md:h-[340px]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_top,#0B0B0C_0%,rgba(11,11,12,0.35)_40%,rgba(11,11,12,0.1)_100%)]"
          />
          <p className="absolute bottom-5 left-5 right-5 max-w-md text-sm leading-relaxed text-textPrimary/90 md:bottom-7 md:left-7">
            Nobody is doing anything wrong here. That is the problem.
          </p>
        </div>

        <BrokenJourney />

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-textMuted">
          None of these are dramatic failures. That is exactly why they persist — each one looks
          like a normal busy Tuesday, and nobody adds them up.
        </p>
      </Section>

      {/* ── What changes ───────────────────────────────────── */}
      <Section
        id="changes"
        eyebrow="What changes"
        title="Every gap becomes a connection."
        lead={
          <>
            The same five stages, joined end to end. An enquiry that lands at 19:42 is answered
            before the patient has finished browsing, booked against real availability, confirmed
            before the day, and recalled when they are due — without anyone remembering to do it.
          </>
        }
      >
        <RevenueJourney />
      </Section>

      {/* ── How it works ───────────────────────────────────── */}
      <Section
        id="system"
        eyebrow="How the system works"
        title="Five parts of one machine."
        lead={
          <>
            Each part is defined by what it receives and what it passes on. Pick one to see where
            it sits — and note that reception is inside the machine, not replaced by it.
          </>
        }
      >
        <SystemMachine />
      </Section>

      {/* ── Live demo ──────────────────────────────────────── */}
      <Section
        id="demo"
        eyebrow="Running now"
        title="What it looks like on a Thursday night."
        lead={
          <>
            One real-shaped enquiry, start to finish — including the moment it hits something it
            should not answer and hands over to a person.
          </>
        }
      >
        <LiveSystemDemo />
      </Section>

      {/* ── ROI ────────────────────────────────────────────── */}
      <Section
        id="roi"
        eyebrow="What it is worth"
        title="Your numbers, not ours."
        lead={
          <>
            Every assumption below is adjustable and every source is shown. If it does not pay back
            at your size, the calculator will say so.
          </>
        }
      >
        <RoiCalculator onResult={setRoi} />
      </Section>

      {/* ── Implementation ─────────────────────────────────── */}
      <Section
        id="implementation"
        eyebrow="Implementation"
        title="Live in four weeks, without closing for a day."
        lead="Your diary, your numbers, your team. Nothing is ripped out."
      >
        <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10">
          <Image
            src="/images/clinics/implementation-session.jpeg"
            alt="Vantage Stack staff working alongside a practice manager at a reception desk."
            width={1800}
            height={1005}
            sizes="(max-width: 768px) 100vw, 90vw"
            className="h-[240px] w-full object-cover brightness-[1.25] md:h-[320px]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_top,#0B0B0C_0%,rgba(11,11,12,0.3)_45%,rgba(11,11,12,0)_100%)]"
          />
          <p className="absolute bottom-5 left-5 right-5 max-w-md text-sm leading-relaxed text-textPrimary/90 md:bottom-7 md:left-7">
            We sit with your reception team, not above them.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            {
              w: "Week 1",
              t: "Map",
              d: "We sit with reception and trace what actually happens to an enquiry — including the workarounds nobody documented.",
            },
            {
              w: "Week 2",
              t: "Connect",
              d: "Intake, booking and your existing diary are joined up. Your numbers and practitioners stay exactly as they are.",
            },
            {
              w: "Week 3",
              t: "Shadow",
              d: "The system runs alongside your team without sending anything. You see every reply it would have made, and correct it.",
            },
            {
              w: "Week 4",
              t: "Hand over",
              d: "It goes live on the channels you approve, one at a time. Reception keeps the override on every conversation.",
            },
          ].map((s, i) => (
            <li key={s.w} className="vs-card !py-5">
              <div className="flex items-baseline gap-3">
                <span className="font-heading text-2xl text-accent/40 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-textMuted">{s.w}</p>
                  <p className="font-heading text-base">{s.t}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-textMuted">{s.d}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Final CTA ──────────────────────────────────────── */}
      <section id="blueprint" className="vs-section relative overflow-hidden scroll-mt-24 md:scroll-mt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[120px]"
        />
        <div className="vs-container relative">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="vs-section-heading">The clinic revenue blueprint</p>
              <h2 className="vs-section-title max-w-lg">
                Four questions about your practice. One honest answer about the money.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-textMuted">
                We map where enquiries are leaving your practice, what that is worth a month at your
                own appointment values, and what it would take to close each gap. It comes back on
                WhatsApp within a working day.
              </p>

              <ul className="mt-7 space-y-3">
                {[
                  "Free, and yours whether or not we work together",
                  "No call to sit through before you receive it",
                  "If a system will not pay for itself at your size, it says so",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-textMuted">
                    <span
                      aria-hidden
                      className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <ClinicBlueprintForm roi={roi} />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10">
        <div className="vs-container">
          <Image
            src="/images/vs-logo-premium.png"
            alt="Vantage Stack"
            width={861}
            height={232}
            className="mb-5 h-8 w-auto object-contain opacity-60"
          />
          <p className="text-xs leading-relaxed text-textMuted">
            Vantage Stack builds booking and communication operations for private practices. The
            system handles scheduling, reminders and enquiry routing. It does not provide medical
            advice, assess symptoms, or make clinical decisions — those stay with your
            practitioners.
          </p>
        </div>
      </footer>
    </main>
  );
}
