"use client";

import type { ReactNode } from "react";
import { Reveal } from "../../../components/marketing/Reveal";
import { BookCta } from "../../../components/marketing/BookCta";
import {
  Pill,
  HeroRating,
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

export function WhatsappAssistantContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>WhatsApp &amp; Teams Assistant · South Africa</Pill>
              <HeroRating />
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Your customers already live on WhatsApp. Now you can <span className="text-accent">answer them 24/7</span>.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack builds a WhatsApp and Teams AI assistant that chats with customers, books appointments, and
                pulls your CRM data and invoices on demand — instantly, at any hour, in a natural South African voice.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Answers 24/7</span>
                <span>✔ Books appointments</span>
                <span>✔ Pulls CRM + invoices</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="See my WhatsApp assistant live" />
                <span className="text-xs text-textMuted/70">Watch it book an appointment on the call.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="WhatsApp Assistant"
                tag="Illustrative chat"
                rows={[
                  { n: "1", t: "Hi, do you have space for a service on Friday?", s: "Customer" },
                  { n: "2", t: "Hi! Yes — 10:00 or 14:30 open on Friday. Which suits you?", s: "Assistant" },
                  { n: "3", t: "14:30 please", s: "Customer" },
                  { n: "✓", t: "Booked ✅ Friday 14:30 — confirmation sent. Anything else?", s: "Assistant", done: true },
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
            'A smartphone showing a WhatsApp chat where an AI assistant books an appointment and pulls an invoice, South African small-business feel. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech style, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>The messages pile up faster than anyone can answer them.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> In South Africa, WhatsApp is where customers actually talk to businesses — but a
          person can only reply so fast. After hours, over weekends, or mid-rush, messages sit unread, and an unanswered
          &ldquo;Are you open?&rdquo; is a customer quietly moving to someone who replied.
        </AnswerBox>
        <Prose>
          So much of your business runs through that little green app: enquiries, bookings, &ldquo;did my order ship?&rdquo;,
          price questions, the same five FAQs over and over. When you&rsquo;re busy doing the actual work, those messages
          wait. And customers on WhatsApp expect fast — a reply an hour later often arrives after they&rsquo;ve already
          booked elsewhere.
        </Prose>
        <Prose>
          Your own team is stuck too. Someone messages &ldquo;what&rsquo;s the balance on the Dlamini invoice?&rdquo; and
          answering means stopping, opening another app, digging, and typing it back. The information exists; it&rsquo;s just
          locked away from the place everyone&rsquo;s already chatting.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>Every slow reply is a customer testing the competition.</SectionTitle>
        <StatBand>
          <StatCard big="24/7">when customers message — most businesses only answer part of it</StatCard>
          <StatCard big="5 min">the window where a lead is 21× more likely to qualify</StatCard>
          <StatCard big="#1">WhatsApp is South Africa&rsquo;s most-used messaging channel</StatCard>
        </StatBand>
        <Prose>
          If even a handful of WhatsApp enquiries a day go unanswered until you&rsquo;re free, and a decent share would have
          booked or bought, that&rsquo;s real revenue leaking out — quietly, with no notification to tell you it happened. You
          paid to get found; the message arrived; and nobody was there to catch it in time.
        </Prose>
        <Prose>
          And it compounds. The customer who waited too long doesn&rsquo;t just buy elsewhere this once — they learn your
          competitor answers faster, and go there first next time. Slow replies don&rsquo;t just cost a sale; they hand over
          the relationship.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a WhatsApp inbox funnel: many incoming messages, showing how manual replies drop most after hours vs an AI assistant capturing 100%. Near-black #0B0B0C background, electric-blue #3B82F6 accents with subtle glow, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>An assistant that lives in WhatsApp — and knows your business.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack builds a custom AI assistant on the official WhatsApp Business Platform
          (and Microsoft Teams for your staff). It answers customers instantly, qualifies and books them, handles your FAQs,
          and — connected to your CRM, invoicing and calendar — answers your team&rsquo;s questions in plain language, right
          inside the chat.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Answers customers instantly">Greets, answers FAQs, qualifies and books — 24/7, in a natural, on-brand voice that feels like a helpful human.</Step>
          <Step n="02" title="Books straight into your diary">Checks real availability, books the slot, sends a confirmation — all inside the WhatsApp conversation.</Step>
          <Step n="03" title="Pulls your data on demand">Ask it &ldquo;balance on invoice 1042?&rdquo; or &ldquo;next delivery for Naidoo?&rdquo; and it answers from your CRM and invoicing instantly.</Step>
          <Step n="04" title="Hands off cleanly">When something needs a human, it routes the chat to the right person with the full context attached.</Step>
        </CardGrid>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="See my WhatsApp assistant live" />
          <span className="text-xs text-textMuted/70">Live demo on your strategy call.</span>
        </div>
      </Section>

      {/* WHAT IT HANDLES */}
      <Section alt>
        <Eyebrow>The everyday wins</Eyebrow>
        <SectionTitle>What it takes off your plate, all day, every day.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="“Are you open / how much / where?”">The endless FAQs answered instantly, correctly, every time — freeing your team for real conversations.</Step>
          <Step title="Bookings & reschedules">Customers book, move or cancel appointments in chat, and your calendar stays perfectly in sync.</Step>
          <Step title="Order & invoice status">&ldquo;Did it ship?&rdquo; &ldquo;What&rsquo;s my balance?&rdquo; answered from live data, no human lookup needed.</Step>
          <Step title="Staff data requests">Your team asks the Teams/WhatsApp assistant for CRM info, invoices or schedules and gets an instant answer.</Step>
          <Step title="Follow-ups">Gentle automated nudges to quiet leads and unpaid invoices, on WhatsApp where they actually get read.</Step>
          <Step title="After-hours cover">Nights and weekends handled, so you never lose the customer who messaged at 9pm.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we get you live</Eyebrow>
        <SectionTitle>Set up properly, on the official platform.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Map your chats">We learn your top questions, booking rules, and what data the assistant should reach.</Step>
          <Step n="2" title="Build & connect">We build the assistant on the WhatsApp Business Platform and wire it to your CRM, invoicing and calendar.</Step>
          <Step n="3" title="Test with you">You chat to it, break it, and sign off on tone and accuracy.</Step>
          <Step n="4" title="Go live & tune">It goes live on your number; we watch real chats and keep improving.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What it looks like in a real business.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A service business got most of its enquiries on WhatsApp but couldn&rsquo;t answer fast enough during busy periods and after hours, losing bookings to quicker competitors.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> A WhatsApp AI assistant that answered instantly, qualified and booked customers into the calendar, and escalated anything complex to a human with full context.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> After-hours and rush-hour enquiries that previously went cold are now captured and booked — the same demand, no longer leaking to the competition.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See it chat</Eyebrow>
        <SectionTitle>60 seconds: a WhatsApp assistant booking a customer and pulling an invoice.</SectionTitle>
        <VideoSlot label="Explainer video slot — live WhatsApp conversation walkthrough" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>AI assistant vs. answering it all yourself.</SectionTitle>
        <CompareTable
          columns={["WhatsApp AI assistant", "Doing it manually"]}
          rows={[
            { label: "Response time", cells: [{ tone: "yes", text: "Instant, 24/7" }, { tone: "no", text: "When someone's free" }] },
            { label: "After-hours", cells: [{ tone: "yes", text: "Always on" }, { tone: "no", text: "Silent" }] },
            { label: "Handles many chats at once", cells: [{ tone: "yes", text: "Unlimited" }, { tone: "no", text: "One at a time" }] },
            { label: "Pulls live CRM + invoice data", cells: [{ tone: "yes", text: "Instantly" }, { tone: "no", text: "Manual lookup" }] },
            { label: "Books into calendar", cells: [{ tone: "yes", text: "Automatic" }, { tone: "no", text: "Back-and-forth" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>WhatsApp &amp; Teams assistants, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "What is a WhatsApp business assistant?", a: "An AI that chats with your customers on WhatsApp — answering questions, qualifying leads, and booking appointments — and can also answer your team's questions by pulling live data like CRM records and invoices. Built custom to your business, 24/7 and POPIA-compliant." },
            { q: "Can it pull my CRM data and invoices?", a: "Yes. Connected to your CRM, invoicing and calendar, you or your team can ask in plain language — “balance on invoice 1042?” — and get an instant answer inside WhatsApp or Teams." },
            { q: "Is WhatsApp automation allowed and POPIA-compliant?", a: "Yes, done right. We build on the official WhatsApp Business Platform and configure consent, opt-outs and secure data handling in line with WhatsApp's policies and POPIA." },
            { q: "Does it work after hours?", a: "Yes — 24/7. Customers get instant answers and bookings at any hour, even when your team is offline." },
          ]}
        />
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>Watch an AI assistant book a customer — live, on WhatsApp.</>}
          cta={<BookCta label="See my WhatsApp assistant live" />}
        >
          Book a free 30-minute demo. We&rsquo;ll show your WhatsApp assistant answering, booking, and pulling data before the
          call ends.
        </FinalCta>
      </Section>
    </>
  );
}
