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

export function WebsiteDesignContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>Website Design · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                A website that looks great is nice. One that <span className="text-accent">brings you enquiries</span> is the point.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack designs fast, mobile-first websites built around one job: turning visitors into enquiries —
                then wiring those enquiries straight into your CRM, booking and follow-up. Beautiful, yes. But built to sell.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Mobile-first</span>
                <span>✔ Built to convert</span>
                <span>✔ Connected to your CRM</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Get my free website teardown" />
                <span className="text-xs text-textMuted/70">We&rsquo;ll show what&rsquo;s costing you enquiries.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Visitor Journey"
                tag="Illustrative"
                rows={[
                  { n: "1", t: "Lands on your site", s: "Fast load · clear offer in 3s" },
                  { n: "2", t: "Sees the next step", s: "Obvious CTA on every screen" },
                  { n: "3", t: "Enquires", s: "One simple form · mobile-friendly" },
                  { n: "✓", t: "Lead in your CRM", s: "Auto follow-up already firing", done: true },
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
            'A sleek modern website shown on a phone and laptop, with a clear call-to-action glowing and a visitor path leading to a booked enquiry. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech aesthetic, South African feel, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>Most business websites are expensive brochures that don&rsquo;t sell.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> A lot of sites look fine but do nothing — no clear offer, no obvious next step,
          slow on mobile, and disconnected from the rest of the business. Visitors arrive, don&rsquo;t know what to do, and
          leave. The site becomes a cost, not a salesperson.
        </AnswerBox>
        <Prose>
          Here&rsquo;s what usually happens. You paid for a website (or you&rsquo;re about to), and it ticks the box — logo,
          some pages, a contact form somewhere. But it was designed to look nice, not to convert. There&rsquo;s no strong
          offer above the fold, no reason to act now, and the path to enquire is buried. So the traffic you worked to get
          slips away without a trace.
        </Prose>
        <Prose>
          And on mobile — where most South African visitors actually are — it&rsquo;s worse: slow to load, awkward to tap,
          forms that fight the thumb. Every second of load time and every extra tap quietly costs you enquiries you never
          even knew you had.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>A site that doesn&rsquo;t convert is paid-for traffic, wasted.</SectionTitle>
        <StatBand>
          <StatCard big="3s">and most visitors judge — and often leave — your site</StatCard>
          <StatCard big="70%+">of South African web traffic is on mobile</StatCard>
          <StatCard big="1">clear next step is what turns a visitor into a lead</StatCard>
        </StatBand>
        <Prose>
          Think about where your visitors come from: ads, Google, social, referrals — all of it costs you money or effort.
          When they land on a site that doesn&rsquo;t guide them to act, that spend evaporates. You&rsquo;re not short of
          traffic; you&rsquo;re losing it at the door.
        </Prose>
        <Prose>
          And it compounds over time. A competitor with a faster, clearer, conversion-focused site turns the same visitors
          into enquiries while yours turns them into bounces — so the gap in leads widens month after month, quietly,
          invisibly.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a funnel showing 100 visitors: a leaky funnel (unclear site) losing most before enquiry vs a tight funnel (conversion-focused site) turning far more into leads. Near-black #0B0B0C background, electric-blue #3B82F6 accents, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>A site designed around the visitor&rsquo;s decision — and your revenue.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack designs and builds a fast, mobile-first website with a clear offer,
          an obvious next step on every screen, and trust signals that make people act — then connects the enquiry to your
          CRM, booking and follow-up so it becomes a worked lead automatically.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Built to convert">A sharp offer, a clear path to enquire, and CTAs that guide every visitor toward acting.</Step>
          <Step n="02" title="Fast & mobile-first">Designed for phones first, built to load fast — because that&rsquo;s where and how your visitors browse.</Step>
          <Step n="03" title="Trust that sells">Reviews, proof and clarity placed where they turn hesitation into enquiries.</Step>
          <Step n="04" title="Connected, not stranded">Enquiries flow into your CRM and follow-up automatically — the site becomes the front of a system.</Step>
        </CardGrid>
        <Prose>
          Because Vantage Stack builds the whole stack, your website isn&rsquo;t a standalone brochure — it&rsquo;s the front
          door to your AI call handling, WhatsApp assistant and automated follow-up. One connected operation that turns
          attention into booked business.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Get my free website teardown" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll map what to fix first.</span>
        </div>
      </Section>

      {/* WHAT'S INCLUDED */}
      <Section alt>
        <Eyebrow>What&rsquo;s included</Eyebrow>
        <SectionTitle>Everything a site needs to earn its keep.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="Conversion-first design">Layouts built around your offer and the visitor&rsquo;s next step, not just aesthetics.</Step>
          <Step title="Mobile-first build">Fast, tap-friendly, tested on real phones before desktop.</Step>
          <Step title="Copy that sells">Clear, benefit-led words that tell visitors why you and what to do.</Step>
          <Step title="SEO foundations">Clean structure, speed and on-page basics so you can be found.</Step>
          <Step title="CRM + booking hookup">Enquiries land in your system and trigger follow-up, not an unread inbox.</Step>
          <Step title="Built to grow">Start with the pages that drive enquiries; expand as the business does.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we build it</Eyebrow>
        <SectionTitle>From teardown to a site that sells.</SectionTitle>
        <CardGrid cols={2}>
          <Step n="1" title="Teardown & plan">We review your current site (or your goals) and map the offer, pages and conversion path.</Step>
          <Step n="2" title="Design">We design mobile-first around your brand and your visitor&rsquo;s decision.</Step>
          <Step n="3" title="Build & connect">We build it fast and wire enquiries into your CRM, booking and follow-up.</Step>
          <Step n="4" title="Launch & improve">Go live, watch real behaviour, and keep tuning for more enquiries.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What a conversion-focused site looks like.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A business had a good-looking site that generated almost no enquiries — no clear offer, slow on mobile, contact form buried.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> A rebuilt mobile-first site with a sharp offer, clear CTAs, and enquiries wired into the CRM with automatic follow-up.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> The same traffic now converts into enquiries instead of bouncing — the site turned from a cost into a lead source.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See the difference</Eyebrow>
        <SectionTitle>60 seconds: a visitor turning into a booked enquiry.</SectionTitle>
        <VideoSlot label="visitor-to-enquiry walkthrough" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>Conversion-built vs. a pretty brochure.</SectionTitle>
        <CompareTable
          columns={["Vantage Stack", 'Template / "just make it pretty"']}
          rows={[
            { label: "Designed to convert", cells: [{ tone: "yes", text: "Yes, around your offer" }, { tone: "no", text: "Looks-first" }] },
            { label: "Mobile performance", cells: [{ tone: "yes", text: "Fast, mobile-first" }, { tone: "no", text: "Often slow" }] },
            { label: "Clear next step", cells: [{ tone: "yes", text: "Every screen" }, { tone: "no", text: "Buried form" }] },
            { label: "Connected to CRM", cells: [{ tone: "yes", text: "Enquiries → worked leads" }, { tone: "no", text: "Unread inbox" }] },
            { label: "Built to grow", cells: [{ tone: "yes", text: "Yes" }, { tone: "no", text: "Redo it later" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Website design, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "What makes a website convert instead of just look nice?", a: "A clear offer, an obvious next step on every screen, fast mobile performance, trust signals, and a frictionless path to enquire or book. We design around the visitor's decision, then wire the enquiry into your CRM and follow-up." },
            { q: "How long does it take to build?", a: "Most business sites go live in a few weeks depending on scope. We start with the pages that drive enquiries and expand from there." },
            { q: "Will it work on mobile?", a: "Yes — mobile-first. Most South African traffic is on phones, so we design and test for mobile before desktop, with fast load times." },
            { q: "Do you connect it to my other tools?", a: "Yes. Your site plugs into your CRM, WhatsApp assistant, booking and follow-up, so an enquiry becomes a tracked, worked lead automatically." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section alt>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who gets the most from a conversion-built website.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> If you rely on your website to bring enquiries — or you want it to — and it&rsquo;s
          currently slow, unclear, outdated or non-existent, a conversion-focused rebuild turns your traffic into leads
          instead of bounces.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={2}>
          <Step title="Traffic but no enquiries">People visit, but almost nobody gets in touch.</Step>
          <Step title="Weak on mobile">Your site is slow or awkward on the phones most people use.</Step>
          <Step title="No clear offer">Visitors can&rsquo;t tell in seconds what you do or what to do next.</Step>
          <Step title="Disconnected">Enquiries land in an inbox and get lost instead of worked.</Step>
        </CardGrid>
        <Prose>
          If two or more land, a site built to convert — and connected to your follow-up — will pay for itself in recovered
          enquiries.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>See exactly what&rsquo;s costing you enquiries — free website teardown.</>}
          cta={<BookCta label="Get my free website teardown" />}
        >
          Book a free teardown. We&rsquo;ll review your current site (or your goals), show you what to fix first, and how a
          conversion-built site would turn your traffic into leads.
        </FinalCta>
      </Section>
    </>
  );
}
