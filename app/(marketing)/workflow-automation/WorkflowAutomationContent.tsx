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

export function WorkflowAutomationContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>AI Workflow Automation · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                The repetitive work eating your week — <span className="text-accent">done on its own</span>.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack automates the routine tasks your team does by hand — moving data between apps, sending
                follow-ups, creating invoices, updating your CRM — and adds AI where a task needs judgement. Work that just
                happens, while your people do the work that matters.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Connects your apps</span>
                <span>✔ AI where needed</span>
                <span>✔ Runs in the background</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Get my free automation audit" />
                <span className="text-xs text-textMuted/70">We&rsquo;ll find your biggest time drains.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Automation"
                tag="Illustrative flow"
                rows={[
                  { n: "1", t: "Trigger: new enquiry", s: "From form, WhatsApp or email" },
                  { n: "2", t: "CRM updated", s: "Record created + tagged" },
                  { n: "3", t: "Follow-up sent", s: "On the right cadence" },
                  { n: "✓", t: "Nobody lifted a finger", s: "Logged + reported automatically", done: true },
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
            'A glowing automated pipeline moving data and tasks between app icons on its own, with a person freed to focus on real work. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech aesthetic, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>Your team spends its week doing what a machine should do.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Every business runs on a pile of small, repetitive tasks — copy this into that,
          send the follow-up, update the sheet, make the invoice, chase the reminder. They&rsquo;re necessary, they&rsquo;re
          mindless, and they quietly consume hours of your team&rsquo;s week that should go to real work.
        </AnswerBox>
        <Prose>
          Look at any afternoon. Someone&rsquo;s re-typing an enquiry from an email into the CRM. Someone else is copying
          figures from one tool into a report. A follow-up is waiting on whoever remembers to send it. An invoice is
          half-drafted. None of it needs skill or judgement — it just needs doing, over and over, forever.
        </Prose>
        <Prose>
          That&rsquo;s the trap of manual process: it&rsquo;s invisible because it&rsquo;s normal. Nobody questions the two
          hours a week spent shuffling data, because &ldquo;that&rsquo;s just how it&rsquo;s done.&rdquo; But those hours are
          real, they&rsquo;re expensive, and they scale with the business — the more you grow, the more of them there are.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>Manual process is a slow leak of time, money and accuracy.</SectionTitle>
        <StatBand>
          <StatCard big="18–25">hrs/week small teams lose to manual admin</StatCard>
          <StatCard big="100%">of repetitive tasks are automation candidates</StatCard>
          <StatCard big="0">value your best people add by copy-pasting</StatCard>
        </StatBand>
        <Prose>
          Every manual step is three costs in one: the time to do it, the errors when someone slips, and the delay while it
          waits for a human. A follow-up that goes out two days late, a figure typed wrong, a lead that sat unworked — each
          is small, but together they&rsquo;re a steady drain on both revenue and trust.
        </Prose>
        <Prose>
          And it caps your growth. When the way you handle more work is &ldquo;add more manual hours,&rdquo; every bit of
          growth adds cost and fragility. Automation breaks that link — the business can do more without the admin doing
          more.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a person manually carrying tasks between apps (slow, error-prone) vs an automated conveyor doing it instantly. Near-black #0B0B0C background, electric-blue #3B82F6 accents, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>Automate the routine — add AI where there&rsquo;s judgement.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack maps the repetitive workflows draining your team, then automates
          them — connecting your apps so data moves and tasks trigger on their own, and adding AI for the steps that need
          light judgement, like reading an email or routing a request. It runs in the background and we keep it healthy.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Connects your apps">Data flows between your tools automatically — no more copy-paste between five tabs.</Step>
          <Step n="02" title="Triggers the work">Events kick off the right steps: an enquiry updates the CRM, fires follow-up, and books the task.</Step>
          <Step n="03" title="AI for judgement">Where a step needs reading, classifying or deciding, AI handles it — not just rigid rules.</Step>
          <Step n="04" title="Monitored & reliable">We watch the automations, catch failures, and keep them running as your business changes.</Step>
        </CardGrid>
        <Prose className="mt-8">
          Because Vantage Stack builds the whole stack, your automations tie together your CRM, website, WhatsApp assistant,
          invoicing and more — so the whole operation runs as one system instead of a set of disconnected tools and manual
          glue.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Get my free automation audit" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll map what to automate first.</span>
        </div>
      </Section>

      {/* WHAT WE AUTOMATE */}
      <Section alt>
        <Eyebrow>The everyday wins</Eyebrow>
        <SectionTitle>The tasks that stop needing a human.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="Lead capture & routing">Enquiries auto-logged, tagged and sent to the right person or sequence.</Step>
          <Step title="Follow-ups & reminders">The right message at the right time, every time, without anyone remembering.</Step>
          <Step title="Data sync">Information kept in step across your tools so nothing is re-typed.</Step>
          <Step title="Invoicing & admin">Quotes to invoices, status updates, and the paperwork, generated automatically.</Step>
          <Step title="Reporting">The numbers pulled together and delivered on schedule, no manual assembly.</Step>
          <Step title="AI-assisted steps">Reading emails, classifying requests, summarising — the judgement calls, handled.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we start</Eyebrow>
        <SectionTitle>From audit to work that runs itself.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Audit">We map your repetitive workflows and find the biggest time drains to automate first.</Step>
          <Step n="2" title="Design">We design the automations around how your business actually works.</Step>
          <Step n="3" title="Build & test">We connect your tools, add AI where needed, and test against real cases.</Step>
          <Step n="4" title="Run & monitor">It runs in the background; we watch it and keep improving.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What automating the routine looks like.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A team spent hours a week manually moving enquiries between tools, sending follow-ups, and assembling reports — with things slipping when someone was busy.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> Automated workflows connecting their apps, firing follow-ups on cadence, and generating reports, with AI handling enquiry classification.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> A large block of weekly hours freed, fewer errors, and nothing slipping — the team focused on real work while the routine ran itself.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See it run</Eyebrow>
        <SectionTitle>60 seconds: an enquiry handled end-to-end, automatically.</SectionTitle>
        <VideoSlot label="a workflow running on its own" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>Automated vs. doing it by hand.</SectionTitle>
        <CompareTable
          columns={["Automated", "Manual"]}
          rows={[
            { label: "Speed", cells: [{ tone: "yes", text: "Instant" }, { tone: "no", text: "When someone gets to it" }] },
            { label: "Errors", cells: [{ tone: "yes", text: "Consistent" }, { tone: "no", text: "Human slips" }] },
            { label: "Runs after hours", cells: [{ tone: "yes", text: "Always" }, { tone: "no", text: "No" }] },
            { label: "Scales with growth", cells: [{ tone: "yes", text: "Yes" }, { tone: "no", text: "Adds cost" }] },
            { label: "Frees your team", cells: [{ tone: "yes", text: "For real work" }, { tone: "no", text: "Stuck on admin" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Workflow automation, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "What is AI workflow automation?", a: "Connecting your apps and processes so routine work happens automatically — data moves, tasks trigger, follow-ups fire without a human doing it by hand. AI is added where a task needs judgement, like reading an email or classifying a request." },
            { q: "What kinds of tasks can be automated?", a: "Anything repetitive and rule-based: moving data between tools, sending follow-ups and reminders, creating invoices, updating the CRM, routing enquiries, generating reports. AI extends this to tasks that need light judgement." },
            { q: "Will automation replace my team?", a: "No — it removes the repetitive, low-value work so your team spends time on what actually needs a person. Most owners use it to grow without hiring for admin." },
            { q: "Does it connect my existing tools?", a: "Yes — automations connect your CRM, website, WhatsApp assistant, invoicing and more, so everything runs as one system." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section alt>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who gets the most from workflow automation.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> If your team loses hours each week to repetitive, copy-paste work across
          disconnected tools, automation hands those hours back and stops things slipping — letting you grow without piling
          on admin.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={2}>
          <Step title="Copy-paste between apps">Data gets moved by hand between tools all day.</Step>
          <Step title="Follow-ups depend on memory">Things get sent when someone remembers — or don&rsquo;t.</Step>
          <Step title="Admin scales with growth">More work means more manual hours, not more output.</Step>
          <Step title="Errors creep in">Manual steps mean the occasional missed or wrong entry.</Step>
        </CardGrid>
        <Prose className="mt-8">
          If two or more land, automating your routine workflows will free hours, cut errors, and let the business grow
          without the admin growing with it.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>Find the hours hiding in your week — free automation audit.</>}
          cta={<BookCta label="Get my free automation audit" />}
        >
          Book a free audit. We&rsquo;ll map your repetitive workflows, show you the biggest time drains, and what
          automating them would give back.
        </FinalCta>
      </Section>
    </>
  );
}
