"use client";

import type { ReactNode } from "react";
import { Reveal } from "../../../components/marketing/Reveal";
import { BookCta } from "../../../components/marketing/BookCta";
import {
  Pill,
  Eyebrow,
  SectionTitle,
  AnswerBox,
  Stat,
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

export function SystemAutomationsContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>System Automations · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Your leads aren&rsquo;t the problem. The <span className="text-accent">admin swallowing them</span> is.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack connects your tools into one automated CRM that captures every lead, sends every follow-up,
                and moves your data around for you — so deals stop dying in the gaps between five different apps.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Every lead captured</span>
                <span>✔ Auto follow-up</span>
                <span>✔ Invoices + WhatsApp connected</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Book a free CRM audit" />
                <span className="text-xs text-textMuted/70">We&rsquo;ll map where your leads are leaking.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Lead Flow"
                tag="Illustrative system flow"
                rows={[
                  { n: "1", t: "New enquiry captured", s: "WhatsApp · auto-logged to CRM" },
                  { n: "2", t: "Follow-up sent", s: "Day 1 · email + WhatsApp" },
                  { n: "3", t: "Appointment booked", s: "Synced to calendar + confirmation" },
                  { n: "✓", t: "Invoice raised", s: "Details pre-filled — no retyping", done: true },
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
            'Clean isometric illustration of a small South African business\'s disconnected apps (WhatsApp, spreadsheet, email, invoicing) connected by glowing blue threads into a single dashboard. Near-black background #0B0B0C, electric-blue #3B82F6 accents, modern glassy tech style, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>Five apps, none of them talking, and you&rsquo;re the integration.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Most small teams run on 3&ndash;5 disconnected tools — a CRM or spreadsheet, WhatsApp,
          email, invoicing, maybe a form — and a human being manually shuttles information between them. That manual shuttling
          is where leads get dropped and hours disappear.
        </AnswerBox>
        <Prose>
          Here&rsquo;s a normal Tuesday. A lead fills in your website form. Someone has to notice it, copy the details into the
          CRM, remember to WhatsApp them, make a note to follow up on Thursday, and later create an invoice by retyping the same
          details a third time. Multiply that by every enquiry, every day, and you&rsquo;ve hired a full-time data-entry clerk —
          except it&rsquo;s you, or your best salesperson, doing it between actual work.
        </Prose>
        <Prose>
          And humans forget. The follow-up meant for Thursday happens next week, or never. The lead who went quiet doesn&rsquo;t
          get chased. The invoice sits undrafted. None of this is incompetence — it&rsquo;s what happens when the &ldquo;system&rdquo;
          is a person&rsquo;s memory stretched across five apps that don&rsquo;t share data.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>The hidden salary you&rsquo;re paying to copy-paste.</SectionTitle>
        <StatBand>
          <StatCard big="18–25">hrs/week lost to manual admin (typical small team)</StatCard>
          <StatCard big="21×">more likely to qualify a lead contacted in 5 min vs 30</StatCard>
          <StatCard big="~42h">the industry-average first response to a new lead</StatCard>
        </StatBand>
        <Prose>
          Think about what those hours are worth. If admin is eating even 15 hours a week that could be spent selling or serving
          clients, that&rsquo;s most of a working day, every week, gone to shuffling data between apps. It never shows up as a
          cost — no invoice arrives for &ldquo;time wasted on data entry&rdquo; — which is exactly why it quietly bleeds.
        </Prose>
        <Prose>
          Then there&rsquo;s the revenue side. Every lead that doesn&rsquo;t get a fast, consistent follow-up is a lead more
          likely to buy from whoever <em>did</em> follow up. A connected CRM that responds and nurtures automatically isn&rsquo;t
          a nice-to-have — it&rsquo;s the difference between leads you paid for converting or quietly going cold.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Split before/after graphic. Left: a stressed owner buried in sticky notes and app windows. Right: the same owner relaxed, one clean glassy dashboard, tasks auto-flowing. Near-black background, electric-blue accents, no readable text.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>One connected system that does the admin for you.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack builds an automated CRM around the tools you already use. Leads are
          captured automatically, follow-ups fire on their own, contacts enrich themselves, and your invoicing, WhatsApp, email
          and calendar all share the same data — so nobody types anything twice.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Every lead captured">Form, WhatsApp, call, or DM — it lands in the CRM automatically, tagged and timestamped. Nothing depends on someone noticing.</Step>
          <Step n="02" title="Follow-ups that fire themselves">Automated sequences chase quiet leads on the right cadence — email + WhatsApp — until they re-engage or book.</Step>
          <Step n="03" title="Data that flows both ways">Invoices, calendar, and messaging share one source of truth. Update once, it&rsquo;s everywhere.</Step>
          <Step n="04" title="Contacts that enrich themselves">New leads get filled out automatically, so your team opens a full picture instead of a blank name.</Step>
        </CardGrid>
        <Prose>
          Because Vantage Stack builds the whole stack, your CRM doesn&rsquo;t stand alone — it plugs straight into an AI voice
          agent that books calls and a WhatsApp assistant that pulls data on demand. One connected operation, not a drawer of
          gadgets.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Show me my leak points" />
          <span className="text-xs text-textMuted/70">Free audit maps your current flow.</span>
        </div>
      </Section>

      {/* WHAT YOU CAN AUTOMATE */}
      <Section alt>
        <Eyebrow>The everyday wins</Eyebrow>
        <SectionTitle>The admin that quietly disappears once it&rsquo;s automated.</SectionTitle>
        <Prose>
          &ldquo;system automation&rdquo; sounds like a huge enterprise project. In practice it&rsquo;s a stack of small, boring,
          daily jobs that each steal a few minutes and together eat your week. Here&rsquo;s what stops needing a human the moment
          we wire it up:
        </Prose>
        <CardGrid cols={2}>
          <Step title="New-lead intake">A form or WhatsApp enquiry auto-creates a full CRM record, tags the source, and alerts the right person — before anyone&rsquo;s opened their inbox.</Step>
          <Step title="The chase sequence">Didn&rsquo;t hear back? Polite follow-ups go out on day 1, 3 and 7 across email and WhatsApp, automatically, until they reply or book.</Step>
          <Step title="Quote → invoice">Approved quote flips into an invoice with the client&rsquo;s details already filled in — no retyping, no version confusion.</Step>
          <Step title="Booking → reminders">A booked appointment triggers confirmation and reminder messages, cutting no-shows without anyone lifting a finger.</Step>
          <Step title="Stale-deal alerts">Any deal gone quiet too long resurfaces on someone&rsquo;s list instead of silently dying in the pipeline.</Step>
          <Step title="Reporting">Where leads come from, what&rsquo;s converting, what&rsquo;s stuck — updated automatically, so you decide on facts, not gut feel.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we get you there</Eyebrow>
        <SectionTitle>Live in about two weeks, no rip-and-replace.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Map the flow">We trace how a lead moves through your tools today and find every manual handoff and leak.</Step>
          <Step n="2" title="Automate the gaps">We wire capture, follow-up, enrichment and data-sync around the tools you keep.</Step>
          <Step n="3" title="Test on real leads">You watch it run, tweak the cadences and messaging, and sign off.</Step>
          <Step n="4" title="Go live + optimise">It runs quietly in the background while we tune conversion.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What it looks like in a real pipeline.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> An advisory relied on referrals and a web form; high-value enquiries were slipping because follow-up was manual and inconsistent.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> Instant acknowledgement + qualification on every enquiry, a structured follow-up cadence, and calendar booking straight into the advisor&rsquo;s diary.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> Tightening follow-up and response time lifts the share of enquiries that convert to booked consults — and with high per-client value, a small percentage gain is the headline.</p>
        </CaseBox>
        <ReviewFlag>Swap for approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section alt>
        <Eyebrow>See it move</Eyebrow>
        <SectionTitle>90 seconds: a lead flowing through an automated CRM.</SectionTitle>
        <VideoSlot label="Explainer video slot — animated lead-flow walkthrough" />
      </Section>

      {/* COMPARISON */}
      <Section>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>Automated CRM vs. doing it by hand.</SectionTitle>
        <CompareTable
          columns={["Automated CRM", "Manual / spreadsheet"]}
          rows={[
            { label: "Every lead captured", cells: [{ tone: "yes", text: "Automatic" }, { tone: "no", text: "If remembered" }] },
            { label: "Follow-up consistency", cells: [{ tone: "yes", text: "Always" }, { tone: "no", text: "Patchy" }] },
            { label: "Data entry", cells: [{ tone: "yes", text: "Once, shared" }, { tone: "no", text: "Retyped per app" }] },
            { label: "Hours/week on admin", cells: [{ tone: "yes", text: "Minimal" }, { tone: "no", text: "18–25" }] },
            { label: "Scales with lead volume", cells: [{ tone: "yes", text: "Yes" }, { tone: "no", text: "Breaks" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section alt>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>System automation, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "What is system automation?", a: "Software that captures leads, updates records, and triggers follow-ups automatically instead of by hand. We build it around your existing tools so every enquiry is logged and every follow-up happens on its own." },
            { q: "How much time will it save me?", a: "Small teams commonly lose 18–25 hours a week to manual admin across disconnected tools. Automating capture, follow-up and data entry gives most of those hours back." },
            { q: "Can it connect my CRM to invoices and WhatsApp?", a: "Yes — CRM, invoicing, WhatsApp, email and calendar share one source of truth, so nothing is retyped between apps." },
            { q: "Do I have to replace my current CRM?", a: "Usually not. We automate around what you already use and only suggest replacing a tool when it's costing more than it saves." },
          ]}
        />
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>Find out exactly where your leads are leaking.</>}
          cta={<BookCta label="Book your free CRM audit" />}
        >
          Book a free CRM audit. We&rsquo;ll map how a lead moves through your business today, show you every leak, and what an
          automated flow would recover.
        </FinalCta>
      </Section>
    </>
  );
}
