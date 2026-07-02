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

export function PersonalAiAssistantContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>Personal AI Assistant · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Your inbox, calendar and to-do list — <span className="text-accent">handled while you work</span>.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack builds you a personal AI assistant that triages your email, schedules your meetings, drafts
                your replies, and pulls the information you need on demand — so you get hours back for the work only you
                can do.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Manages your inbox</span>
                <span>✔ Books your meetings</span>
                <span>✔ You stay in control</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Book my assistant demo" />
                <span className="text-xs text-textMuted/70">See it handle a real inbox on the call.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Your Assistant"
                tag="Illustrative"
                rows={[
                  { n: "1", t: "Inbox triaged", s: "12 emails sorted · 3 need you" },
                  { n: "2", t: "Reply drafted", s: "Ready for your one-tap approval" },
                  { n: "3", t: "Meeting booked", s: "Thu 10:00 · invite sent" },
                  { n: "✓", t: "Reminder set", s: "Follow up with supplier Friday", done: true },
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
            'A calm business owner focused on real work while a glowing AI assistant handles email, calendar and reminders around them. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech style, South African feel, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>You didn&rsquo;t start a business to be its admin department.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> The higher up you are in a small business, the more your day gets eaten by email,
          scheduling, follow-ups and &ldquo;quick&rdquo; admin. It&rsquo;s necessary, it&rsquo;s endless, and it&rsquo;s
          stealing the time you should be spending on the work that actually grows the business.
        </AnswerBox>
        <Prose>
          Think about how a normal day really goes. You sit down to do the important thing, and first you have to clear the
          inbox. Then someone needs a time to meet, so there&rsquo;s a back-and-forth. Then a reply to draft, a reminder to
          set, a document to find, a supplier to chase. By the time the admin&rsquo;s handled, the day&rsquo;s half gone —
          and the important thing is still waiting.
        </Prose>
        <Prose>
          None of it is hard. That&rsquo;s the frustrating part. It&rsquo;s just a constant drip of small tasks that only
          need <em>a</em> brain, not <em>your</em> brain — but there&rsquo;s been nobody to hand them to. So they land on
          you, every day, and your most valuable time gets spent on your least valuable work.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>The most expensive time in the business, spent on the cheapest work.</SectionTitle>
        <StatBand>
          <StatCard big="18–25">hrs/week owners and managers lose to admin</StatCard>
          <StatCard big="~2.5h">a typical day just managing email</StatCard>
          <StatCard big="1">full working day a week you could get back</StatCard>
        </StatBand>
        <Prose>
          Put an honest hourly value on your time. Now multiply it by the hours you spend each week on inbox triage,
          scheduling and routine drafting. That&rsquo;s the real cost — not a line on an invoice, but the growth, strategy
          and rest that never happen because the admin always comes first.
        </Prose>
        <Prose>
          And it doesn&rsquo;t just cost hours; it costs focus. Every time you drop into the inbox to &ldquo;quickly&rdquo;
          handle something, you pay the switching cost of climbing back into deep work. The admin isn&rsquo;t just taking
          your time — it&rsquo;s fragmenting the time it leaves you.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a working week bar split into "admin" (large faded grey block) vs "growth work" (small bright blue block), then an arrow to the same week with the blue block much larger after an AI assistant takes the admin. Near-black #0B0B0C background, electric-blue #3B82F6 accents, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>A personal assistant that never sleeps — and never forgets.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack builds you a personal AI assistant wired to your inbox, calendar and
          tools. It triages and drafts email, schedules meetings, sets reminders, and fetches information on demand —
          proposing everything for your approval so you stay in control while the admin quietly disappears.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Runs your inbox">Sorts and prioritises email, drafts replies in your voice, and surfaces the few things that actually need you.</Step>
          <Step n="02" title="Owns your calendar">Handles the back-and-forth, books meetings around your rules, and sends invites and reminders.</Step>
          <Step n="03" title="Fetches what you need">Ask it in plain language for a document, a client&rsquo;s history, or a number, and it brings it back.</Step>
          <Step n="04" title="Keeps you in control">It proposes; you approve. You decide what it can do on its own and what needs a thumbs-up first.</Step>
        </CardGrid>
        <Prose>
          Because Vantage Stack builds the whole stack, your assistant can reach into your CRM, your WhatsApp assistant and
          your workflows — so it&rsquo;s not a toy chatbot, it&rsquo;s a genuine team member that knows your business.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Book my assistant demo" />
          <span className="text-xs text-textMuted/70">Watch it clear an inbox live.</span>
        </div>
      </Section>

      {/* WHAT IT DOES */}
      <Section alt>
        <Eyebrow>The everyday wins</Eyebrow>
        <SectionTitle>What lands on the assistant instead of you.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="Inbox triage">Every morning, email sorted by priority with the noise cleared and replies pre-drafted.</Step>
          <Step title="Scheduling">The &ldquo;when works for you?&rdquo; ping-pong handled end-to-end, booked into your diary.</Step>
          <Step title="Follow-ups & reminders">Nothing slips — it remembers to chase the quote, the supplier, the promise you made.</Step>
          <Step title="Drafting">Emails, quotes, summaries drafted in your tone, ready for a quick check and send.</Step>
          <Step title="Information on demand">&ldquo;What did we agree with this client?&rdquo; answered instantly from your own records.</Step>
          <Step title="Daily brief">A short rundown of what needs you today, so you start focused instead of firefighting.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we set it up</Eyebrow>
        <SectionTitle>Yours in about two weeks.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Learn your day">We map your inbox habits, calendar rules, tone and the tasks that eat your time.</Step>
          <Step n="2" title="Build & connect">We wire the assistant securely to your email, calendar and tools, tuned to your preferences.</Step>
          <Step n="3" title="Trial with guardrails">It starts by proposing everything for approval; you widen what it does on its own as trust grows.</Step>
          <Step n="4" title="Get your time back">It runs in the background; we keep tuning it to how you actually work.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What it looks like for a busy owner.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A founder was losing the first two hours of every day to email and scheduling, pushing real work into the evenings.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> A personal AI assistant that triaged the inbox overnight, drafted replies for approval, and handled all meeting scheduling.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> Mornings freed for focused work, evenings handed back, and nothing falling through the cracks — the same person, far less admin drag.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See it work</Eyebrow>
        <SectionTitle>60 seconds: an assistant clearing a morning&rsquo;s admin.</SectionTitle>
        <VideoSlot label="a day handled by your assistant" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>AI assistant vs. doing it yourself vs. a hire.</SectionTitle>
        <CompareTable
          columns={["AI Assistant", "Doing it yourself", "Human PA"]}
          rows={[
            { label: "Available", cells: [{ tone: "yes", text: "24/7" }, { tone: "no", text: "Your time" }, { tone: "no", text: "Work hours" }] },
            { label: "Inbox at 5am", cells: [{ tone: "yes", text: "Already sorted" }, { tone: "no", text: "Waiting for you" }, { tone: "no", text: "Not yet in" }] },
            { label: "Monthly cost", cells: [{ tone: "yes", text: "Scoped" }, { tone: "no", text: "Your lost hours" }, { tone: "no", text: "A full salary" }] },
            { label: "Forgets things", cells: [{ tone: "yes", text: "Never" }, { tone: "no", text: "We all do" }, { tone: "no", text: "Sometimes" }] },
            { label: "You stay in control", cells: [{ tone: "yes", text: "Approve anything" }, { tone: "yes", text: "Yes" }, { tone: "yes", text: "Yes" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Personal AI assistants, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "What is a personal AI assistant for business?", a: "An AI that handles your day-to-day admin — triaging and drafting email, scheduling meetings, sending reminders, and pulling information you ask for — so you spend time on the work only you can do. Built around your tools, inbox and calendar." },
            { q: "How much time can it save?", a: "Owners and managers commonly lose 18–25 hours a week to admin. Automating email triage, scheduling and routine drafting gives a large share of that time back." },
            { q: "Is my data safe?", a: "Yes. We configure secure access and POPIA-aligned data handling, and the assistant only touches the accounts and data you connect it to." },
            { q: "Do I still stay in control?", a: "Always. It drafts and proposes; you approve anything that matters. You decide what it can send or book on its own." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section alt>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who gets the most from a personal AI assistant.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> If you&rsquo;re a founder, owner or manager whose day gets swallowed by email,
          scheduling and admin, this hands you back hours — and your focus — without the cost and management of a
          full-time hire.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={2}>
          <Step title="Your inbox runs your day">You start in email and never quite escape it.</Step>
          <Step title="Admin eats your evenings">Real work gets pushed to after hours because days go to admin.</Step>
          <Step title="Things slip">Follow-ups and promises fall through the cracks when it&rsquo;s all on you.</Step>
          <Step title="A hire feels like too much">You want the help without the salary, recruiting and managing.</Step>
        </CardGrid>
        <Prose>
          If two or more land, an assistant that quietly runs the admin will give you back the most valuable thing you have
          — your time.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>Get your time back — see your assistant handle a real inbox.</>}
          cta={<BookCta label="Book my assistant demo" />}
        >
          Book a free demo. We&rsquo;ll show your personal AI assistant triaging email, drafting replies and booking a
          meeting before the call ends.
        </FinalCta>
      </Section>
    </>
  );
}
