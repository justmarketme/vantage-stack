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
// system. Booking → Cal.com (confirmed). Reference implementation for the set.

function Section({ alt = false, id, children }: { alt?: boolean; id?: string; children: ReactNode }) {
  return (
    <section id={id} className={`vs-section ${alt ? "border-t border-white/5 bg-black/40" : ""}`}>
      <div className="vs-container">
        <Reveal>{children}</Reveal>
      </div>
    </section>
  );
}

export function AiCallingContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>AI Voice Agents · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Every missed call is a customer calling <span className="text-accent">your competitor</span> instead.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack builds AI voice agents that answer every call, qualify the lead, and book the appointment —
                24/7, in a natural South African voice. No voicemail. No &ldquo;we&rsquo;ll call you back.&rdquo; No lost deals.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ POPIA-compliant</span>
                <span>✔ Works through load-shedding</span>
                <span>✔ Books into your calendar</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Get my free missed-call audit" />
                <span className="text-xs text-textMuted/70">See what slow response is costing you — and hear a live agent.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="AI Call Flow"
                tag="Illustrative system flow"
                rows={[
                  { n: "1", t: "Incoming call", s: "Detecting caller · 2s" },
                  { n: "2", t: "Caller qualified", s: "Intent + details captured" },
                  { n: "3", t: "Slot offered", s: "Checking live calendar" },
                  { n: "✓", t: "Appointment booked", s: "WhatsApp confirmation sent", done: true },
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
            'A glowing AI voice waveform answering a ringing phone at night, booking a calendar slot, South African small-business setting. Near-black background #0B0B0C, electric-blue #3B82F6 accents, glassy modern tech style, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>Your phone is your best salesperson — and it&rsquo;s off half the time.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Most South African small businesses miss a fifth to a third of their inbound calls,
          and most missed callers never call back — they call the next result on Google. An AI voice agent answers 100% of
          those calls instantly, so no enquiry goes to a competitor by default.
        </AnswerBox>
        <Prose>
          Think about how leads reach you. Someone sees your ad, gets a referral, or finds you on Google. They&rsquo;re
          interested right now. They call. And then one of a dozen ordinary things happens: you&rsquo;re on a job, on another
          call, driving, with a client, or it&rsquo;s 7pm and everyone&rsquo;s gone. It rings out. Maybe they leave a
          voicemail. Usually they don&rsquo;t.
        </Prose>
        <Prose>
          By the time you see the missed call and phone back — two hours later, or the next morning — the moment&rsquo;s gone.
          They&rsquo;ve moved on, and moved on usually means they called the next business on the list. There&rsquo;s no line
          item on your P&amp;L for &ldquo;revenue that phoned once and gave up,&rdquo; which is exactly why it bleeds unnoticed,
          month after month.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>Let&rsquo;s put a rand figure on the calls you&rsquo;re missing.</SectionTitle>
        <StatBand>
          <StatCard big="21×">more likely to qualify a lead contacted within 5 minutes</StatCard>
          <StatCard big="391%">conversion lift from a one-minute response</StatCard>
          <StatCard big="0.1%">of companies actually engage a lead within 5 minutes</StatCard>
        </StatBand>
        <Prose>
          Say you miss just <strong>4 calls a week</strong> — modest for most businesses. That&rsquo;s ~17 a month. If even{" "}
          <strong>1 in 4</strong> would&rsquo;ve become a customer, and your average job is worth <strong>R6,000</strong>,
          that&rsquo;s <Stat>17 × 25% × R6,000 = R25,500 in lost revenue every single month</Stat> — over R300,000 a year,
          gone silently to whoever answered their phone.
        </Prose>
        <ReviewFlag>Confirm this illustrative ROI example (4 calls/week × 25% × R6,000), or swap in your real client averages.</ReviewFlag>
        <Prose>
          And the bar is astonishingly low: the average first response to an inbound lead is around <Stat>42 hours</Stat>, and
          only about <strong>0.1%</strong> of companies engage within five minutes. The moment you answer instantly,
          you&rsquo;re not competing on price or brand — you&rsquo;re simply the only business that picked up while the
          customer still cared.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic, speed-to-lead. Three ascending glowing bars: "5 min → 21× more likely to qualify", "1 min → 391% conversion lift", vs a tall faded bar "42 hours → industry average (too slow)". Near-black #0B0B0C background, electric-blue #3B82F6 bars with subtle glow, minimal modern style, large clean numerals, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>An AI voice agent that answers every call and books the meeting.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack builds you a custom AI voice agent — a natural-sounding South African
          voice that answers and makes calls, qualifies the caller, handles your common questions, and books confirmed
          appointments straight into your calendar. It runs 24/7, handles many calls at once, and never has an off day.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Answers on the first ring">Every call, every time — 6am, midnight, mid-load-shedding. No voicemail, no hold music, no lost lead.</Step>
          <Step n="02" title="Qualifies the lead">Asks your questions, captures the details, and figures out whether this is a hot lead, a quick FAQ, or a job for a human.</Step>
          <Step n="03" title="Books the appointment">Checks real calendar availability, books the slot, and fires off a WhatsApp or SMS confirmation instantly.</Step>
          <Step n="04" title="Logs it to your CRM">Every call, transcript and outcome flows into your system — so nothing lives only in someone&rsquo;s memory.</Step>
        </CardGrid>
        <h3 className="mt-8 font-heading text-lg text-textPrimary">Built for South African realities</h3>
        <Prose><strong className="text-textPrimary">Load-shedding-proof.</strong> The agent lives in the cloud on redundant infrastructure with backup power. Your office can go dark; your calls still get answered.</Prose>
        <Prose><strong className="text-textPrimary">POPIA-compliant by design.</strong> Consent handling, call disclosure and secure storage of personal information are configured into every deployment.</Prose>
        <Prose><strong className="text-textPrimary">A voice that sounds like home.</strong> A natural South African accent your customers trust — not a flat, obviously-foreign robocall they hang up on.</Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Show me what my agent would sound like" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll demo a live agent on your call.</span>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section alt>
        <Eyebrow>How we get you live</Eyebrow>
        <SectionTitle>From first call to first booking in about two weeks.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Map your calls">We learn your top call types, qualifying questions, calendar rules and tone.</Step>
          <Step n="2" title="Build & train">We script and voice your custom agent, wire it to your calendar and CRM, and tune it on real scenarios.</Step>
          <Step n="3" title="Test with you">You call it, break it, and sign off. We refine until it sounds and behaves exactly right.</Step>
          <Step n="4" title="Go live & optimise">The agent goes live on your line. We watch real calls and keep improving booking rates.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What it looks like in a real business.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A business was missing ~30% of inbound calls after hours and during busy periods, with no way to know how many leads it was losing.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> A 24/7 AI voice agent that answered every call, qualified callers, and booked consultations with instant WhatsApp confirmation.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> After-hours calls that were previously lost are now captured and booked — the same demand, no longer leaking to faster competitors.</p>
        </CaseBox>
        <ReviewFlag>Replace with an approved anonymized case study from case_studies/ (keep industry + numbers real).</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section alt>
        <Eyebrow>Hear it for yourself</Eyebrow>
        <SectionTitle>60 seconds: an AI voice agent booking a real appointment.</SectionTitle>
        <VideoSlot label="SA-voiced live demo" />
      </Section>

      {/* COMPARISON */}
      <Section>
        <Eyebrow>The honest comparison</Eyebrow>
        <SectionTitle>AI voice agent vs. the alternatives.</SectionTitle>
        <CompareTable
          columns={["AI Voice Agent", "Human Receptionist", "Voicemail"]}
          rows={[
            { label: "Answers 24/7", cells: [{ tone: "yes", text: "Yes" }, { tone: "no", text: "Business hours" }, { tone: "no", text: "Never talks" }] },
            { label: "Instant response", cells: [{ tone: "yes", text: "Every call" }, { tone: "no", text: "If free" }, { tone: "no", text: "No" }] },
            { label: "Handles many at once", cells: [{ tone: "yes", text: "Yes" }, { tone: "no", text: "One at a time" }, { tone: "no", text: "n/a" }] },
            { label: "Books into your calendar", cells: [{ tone: "yes", text: "Yes" }, { tone: "yes", text: "Sometimes" }, { tone: "no", text: "No" }] },
            { label: "Works in load-shedding", cells: [{ tone: "yes", text: "Yes" }, { tone: "no", text: "If powered" }, { tone: "no", text: "No" }] },
            { label: "Typical monthly cost", cells: [{ tone: "yes", text: "Scoped to volume" }, { tone: "no", text: "R8k–R15k" }, { tone: "plain", text: "Cheap & useless" }] },
          ]}
        />
        <ReviewFlag>Confirm the R8k–R15k human-receptionist benchmark (sourced from market data).</ReviewFlag>
      </Section>

      {/* FAQ */}
      <Section alt>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>AI voice agents, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "What is an AI voice agent?", a: "Software that answers and makes phone calls in a natural human voice — greeting callers, answering questions, qualifying leads, and booking appointments 24/7. We build each one custom to your business, scripts and South African accent." },
            { q: "How much does it cost in South Africa?", a: "Market pricing typically starts around R8,000 once-off setup per agent plus usage near R100 per agent-hour, often with a monthly minimum. A human receptionist runs R8,000–R15,000/month for business hours only. We scope pricing to your call volume." },
            { q: "Will it work during load-shedding?", a: "Yes. Agents run in the cloud on redundant infrastructure with backup power, so calls are answered even when your office loses power." },
            { q: "Is it POPIA-compliant?", a: "Yes. Consent handling, call disclosure and secure storage of personal information are built into every deployment." },
            { q: "How fast does it respond to a new lead?", a: "Instantly. Leads contacted within 5 minutes are 21× more likely to qualify, and a one-minute response can lift conversions by up to 391%." },
          ]}
        />
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>See exactly how many calls — and how much revenue — you&rsquo;re missing.</>}
          cta={<BookCta label="Get my free missed-call audit" />}
        >
          Book a free 30-minute strategy call. We&rsquo;ll calculate your real missed-call cost, and you&rsquo;ll hear a live
          AI voice agent book an appointment before the call ends.
        </FinalCta>
      </Section>
    </>
  );
}
