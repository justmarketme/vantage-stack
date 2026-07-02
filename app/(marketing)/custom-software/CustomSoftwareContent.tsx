"use client";

import type { ReactNode } from "react";
import { Reveal } from "../../../components/marketing/Reveal";
import { BookCta } from "../../../components/marketing/BookCta";
import {
  Pill,
  Eyebrow,
  SectionTitle,
  AnswerBox,
  Prose,
  StatBand,
  StatCard,
  CardGrid,
  Step,
  CompareTable,
  Faq,
  ImageSlot,
  VideoSlot,
  CaseBox,
  FinalCta,
  HeroMock,
  ReviewFlag,
} from "../../../components/marketing/primitives";

// Body sections only — the (marketing) layout provides the real Navbar + Footer.
// Copy + JSON-LD carried from the source spec; rendered through the real design
// system. Booking → Cal.com (confirmed).

function Section({ alt = false, id, children }: { alt?: boolean; id?: string; children: ReactNode }) {
  return (
    <section id={id} className={`vs-section ${alt ? "border-t border-white/5 bg-black/40" : ""}`}>
      <div className="vs-container">
        <Reveal>{children}</Reveal>
      </div>
    </section>
  );
}

export function CustomSoftwareContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>Custom Software · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                When off-the-shelf doesn&rsquo;t fit, we build the <span className="text-accent">exact tool you need</span>.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack builds custom software shaped to precisely how your business works — replacing fragile
                spreadsheets, manual workarounds and half-fitting apps with one system that matches your process.
                AI-accelerated builds, owned by you.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Built to your process</span>
                <span>✔ Owned by you</span>
                <span>✔ Connects to your stack</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Book my free scoping call" />
                <span className="text-xs text-textMuted/70">We&rsquo;ll map what to build first.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Build Path"
                tag="Illustrative"
                rows={[
                  { n: "1", t: "Your process, mapped", s: "The exact workflow you run" },
                  { n: "2", t: "Scoped & specced", s: "Start with the highest-value piece" },
                  { n: "3", t: "Built fast", s: "AI-accelerated development" },
                  { n: "✓", t: "Running & connected", s: "Wired into your CRM + tools", done: true },
                ]}
              />
            </Reveal>
          </div>
        </div>
      </header>

      {/* HERO IMAGE */}
      <div className="vs-container">
        <ImageSlot
          wide
          label="IMAGE"
          prompt={
            'Tangled spreadsheets and mismatched apps on the left resolving into one clean custom-built dashboard on the right, glowing blue connections. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech aesthetic, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>You&rsquo;re bending your business to fit software that was never built for it.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Off-the-shelf tools are built for the average business, not yours. So you end up
          with spreadsheets holding the real logic together, manual workarounds to force tools to behave, and a stack of
          subscriptions that still don&rsquo;t quite do what you need. The software should fit the business — not the other
          way round.
        </AnswerBox>
        <Prose>
          It creeps up on you. One tool for this, another for that, a spreadsheet to glue them, a person whose job is
          really &ldquo;make the software cooperate.&rdquo; Each piece sort of works, but nothing quite fits, and the gaps
          get filled by human effort and memory. The business runs on duct tape — and duct tape is fragile.
        </Prose>
        <Prose>
          And the more you grow, the worse it gets. The workarounds that held at ten clients strain at fifty. The
          spreadsheet that one person understood becomes a single point of failure. What felt like &ldquo;good
          enough&rdquo; quietly becomes the thing holding the business back.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>Workarounds are a tax you pay every single day.</SectionTitle>
        <StatBand>
          <StatCard big="3–5">disconnected tools a typical small team juggles</StatCard>
          <StatCard big="hrs">lost weekly to manual glue between them</StatCard>
          <StatCard big="1">fragile spreadsheet often runs the whole thing</StatCard>
        </StatBand>
        <Prose>
          Add up the cost honestly: the subscriptions for tools you half-use, the hours spent forcing them to work
          together, the errors when a manual step gets missed, and the risk sitting in a spreadsheet only one person
          understands. It&rsquo;s real money and real fragility, paid quietly, month after month.
        </Prose>
        <Prose>
          And there&rsquo;s a ceiling to it. Manual workarounds don&rsquo;t scale — they break under growth. So the very
          thing you&rsquo;d celebrate, more business, is the thing that exposes how much your operation is held together by
          effort instead of systems.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a messy web of disconnected app icons + spreadsheets with manual arrows, transforming into a single unified custom system. Near-black #0B0B0C background, electric-blue #3B82F6 accents, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>Software built to your business — not the average one.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack builds custom software that matches exactly how you work. We start
          with the highest-value piece, build it fast with modern AI-accelerated development, connect it to your existing
          tools, and hand you something you own — not another subscription you rent.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Fits your process">Built around how your business actually runs, not a generic template you have to bend around.</Step>
          <Step n="02" title="Built fast">Modern AI-accelerated development means scoped tools ship far quicker and cheaper than the old model.</Step>
          <Step n="03" title="Connected">It plugs into your CRM, website, WhatsApp assistant and workflows so everything works as one system.</Step>
          <Step n="04" title="Owned by you">Built for your business and yours to keep — no per-seat lock-in to someone else&rsquo;s roadmap.</Step>
        </CardGrid>
        <Prose className="mt-6">
          Because Vantage Stack builds the whole stack, your custom software isn&rsquo;t an island — it&rsquo;s a piece of
          one connected operation, sharing data with your automation, CRM and assistants. That&rsquo;s the difference
          between another tool and a real system.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Book my free scoping call" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll scope the first build free.</span>
        </div>
      </Section>

      {/* WHAT WE BUILD */}
      <Section alt>
        <Eyebrow>What we build</Eyebrow>
        <SectionTitle>The kinds of tools that replace the duct tape.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="Internal dashboards">One place to see and run your operation, instead of five tabs and a spreadsheet.</Step>
          <Step title="Workflow tools">Bespoke tools for the exact process your business lives on — quoting, jobs, bookings, tracking.</Step>
          <Step title="Client portals">Give your customers a clean place to interact, order, or check status.</Step>
          <Step title="Integrations">Make the tools you keep talk to each other, so data stops being retyped.</Step>
          <Step title="Automation logic">Custom rules and flows that handle the repetitive decisions for you.</Step>
          <Step title="Data & reporting">The numbers that run your business, in one trustworthy place.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we build it</Eyebrow>
        <SectionTitle>From scoping call to a tool that runs.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Scope">We map your process and find the single highest-value thing to build first.</Step>
          <Step n="2" title="Spec">We define exactly what it does and how it fits your stack — no scope creep.</Step>
          <Step n="3" title="Build & test">We build it fast, test it against real use, and refine with you.</Step>
          <Step n="4" title="Run & expand">It goes live and connected; we grow it as the business does.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What replacing the workarounds looks like.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A business ran its core operation on a tangle of spreadsheets and three tools that didn&rsquo;t talk, with hours lost to manual re-entry and a fragile single point of failure.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> A custom internal tool matching their exact process, connected to their existing stack, built to replace the spreadsheets and glue.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> The manual glue disappears, errors drop, and the operation runs on a system instead of memory — freeing hours and removing risk.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See it built</Eyebrow>
        <SectionTitle>60 seconds: spreadsheets and glue becoming one custom tool.</SectionTitle>
        <VideoSlot label="from duct-tape to a real system" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>Custom vs. off-the-shelf vs. spreadsheets.</SectionTitle>
        <CompareTable
          columns={["Custom (Vantage Stack)", "Off-the-shelf", "Spreadsheets"]}
          rows={[
            { label: "Fits your process", cells: [{ tone: "yes", text: "Exactly" }, { tone: "no", text: "Roughly" }, { tone: "no", text: "You build it" }] },
            { label: "Scales with growth", cells: [{ tone: "yes", text: "Yes" }, { tone: "yes", text: "Sometimes" }, { tone: "no", text: "Breaks" }] },
            { label: "Connected to your stack", cells: [{ tone: "yes", text: "Built in" }, { tone: "no", text: "Maybe" }, { tone: "no", text: "Manual" }] },
            { label: "Ongoing cost", cells: [{ tone: "yes", text: "You own it" }, { tone: "no", text: "Per-seat forever" }, { tone: "yes", text: "Cheap & fragile" }] },
            { label: "Single point of failure", cells: [{ tone: "yes", text: "Removed" }, { tone: "yes", text: "Vendor risk" }, { tone: "no", text: "One person" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Custom software, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "When does a business need custom software?", a: "When off-the-shelf tools don't fit your process, when you're running on fragile spreadsheets and manual workarounds, or when you're paying for several tools that still don't do what you need. Custom software matches your workflow instead of forcing you to match it." },
            { q: "Isn't custom software slow and expensive?", a: "It used to be. We build with modern AI-accelerated development, so scoped tools ship far faster and cheaper than the old model. We start with the highest-value piece and expand." },
            { q: "Do I own the software?", a: "Yes. It's built for your business and yours to keep — no per-seat lock-in to someone else's product roadmap." },
            { q: "Will it connect to my other tools?", a: "Yes — it connects to your CRM, website, WhatsApp assistant and workflows so everything works as one system." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section alt>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who gets the most from custom software.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> If your business runs on spreadsheets and workarounds, or you&rsquo;re paying for
          tools that still don&rsquo;t fit, custom software removes the fragility and the manual glue — and gives you a
          system that scales.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={2}>
          <Step title="Spreadsheets run the business">Critical logic lives in a sheet only one person understands.</Step>
          <Step title="Tools that don't fit">You force off-the-shelf apps to behave with manual workarounds.</Step>
          <Step title="Re-typing data">The same information gets entered into several disconnected tools.</Step>
          <Step title="Growth is straining it">What worked small is breaking as you scale.</Step>
        </CardGrid>
        <Prose className="mt-6">
          If two or more land, a custom tool built to your process will remove the drag and the risk — and pay for itself
          in recovered hours and reliability.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>Tell us what doesn&rsquo;t fit — we&rsquo;ll scope the fix, free.</>}
          cta={<BookCta label="Book my free scoping call" />}
        >
          Book a free scoping call. We&rsquo;ll map your process, find the highest-value thing to build first, and show you
          what a custom tool would look like.
        </FinalCta>
      </Section>
    </>
  );
}
