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

export function PaidAdsContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>Paid Ads Management · South Africa</Pill>
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                You&rsquo;re not short of clicks. You&rsquo;re short of <span className="text-accent">leads you can count</span>.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack runs your Facebook, Instagram, Google and LinkedIn ads as one connected engine — wired straight
                into your CRM, so you finally see cost per lead and real revenue, not a dashboard full of clicks that never
                became customers.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Facebook + Instagram</span>
                <span>✔ Google</span>
                <span>✔ LinkedIn (B2B)</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Get my free ad-spend audit" />
                <span className="text-xs text-textMuted/70">We&rsquo;ll show you where budget is leaking.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Ad → Revenue"
                tag="Illustrative attribution"
                rows={[
                  { n: "1", t: "Ad click", s: "Facebook · tracked with pixel" },
                  { n: "2", t: "Lead captured", s: "Logged to CRM + source tagged" },
                  { n: "3", t: "Followed up automatically", s: "No lead left cold" },
                  { n: "✓", t: "Sale attributed", s: "Cost per lead + return, visible", done: true },
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
            'Sleek illustration of ad platforms feeding into a single CRM dashboard showing leads and rand revenue, glowing blue data lines. Near-black #0B0B0C background, electric-blue #3B82F6 accents, modern glassy tech aesthetic, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>Most small businesses are buying clicks, not customers.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Plenty of businesses run ads and see &ldquo;results&rdquo; — impressions, clicks,
          likes — but can&rsquo;t tell you which ad actually produced a paying customer. Without that link between spend and
          revenue, you&rsquo;re flying blind, and budget quietly pours into campaigns that look busy but don&rsquo;t sell.
        </AnswerBox>
        <Prose>
          It usually goes one of two ways. Either you boost the odd post and hope, with no real strategy or tracking. Or an
          agency runs your ads and sends a monthly report full of reach and engagement — numbers that feel good but never
          answer the only question that matters: <em>did this make me money?</em>
        </Prose>
        <Prose>
          The gap is almost always tracking. The ad platform knows about the click. Your CRM knows about the lead and the
          sale. But nobody connected the two, so you can&rsquo;t see that R4,000 on one campaign brought ten real enquiries
          while R4,000 on another brought none. So you keep funding both — because you genuinely can&rsquo;t tell them apart.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>Untracked ad spend is the easiest money to waste.</SectionTitle>
        <StatBand>
          <StatCard big="R0">proven return you can see without CRM tracking</StatCard>
          <StatCard big="½">of ad budget is often wasted — you just don&rsquo;t know which half</StatCard>
          <StatCard big="100%">of clicks mean nothing if none convert to revenue</StatCard>
        </StatBand>
        <Prose>
          Every month without proper tracking is a month you&rsquo;re guessing. You might be sitting on a campaign that&rsquo;s
          genuinely profitable and starving it — or pouring money into a good-looking one that never sells. Both are expensive,
          and both are invisible until you connect the spend to the sale.
        </Prose>
        <Prose>
          And there&rsquo;s an opportunity cost on top. While budget leaks into untracked campaigns and stale creative, a
          competitor who <em>is</em> measuring properly is compounding — cutting their losers, scaling their winners, and
          lowering their cost per customer month after month. In paid ads, the business that measures wins, and the one that
          guesses subsidises it.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a bar chart contrasting \'vanity metrics\' (impressions, clicks, likes) as faded grey bars vs \'what pays\' (leads, cost-per-lead, revenue) as bright blue bars. Near-black #0B0B0C background, electric-blue #3B82F6 accents with subtle glow, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>Full-stack ads, measured in leads and rands.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack runs your paid ads across the platforms your buyers actually use,
          produces and tests the creative, and wires everything to your CRM — so every lead and sale is attributed to the
          campaign that produced it. You scale what&rsquo;s profitable and cut what isn&rsquo;t, on evidence, not gut feel.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="The right channel mix">Google for intent, Facebook/Instagram for demand and retargeting, LinkedIn for B2B — chosen for where your customers are.</Step>
          <Step n="02" title="Creative that's tested, not guessed">We produce and continuously test ad creative — usually the biggest lever on performance — toward what converts.</Step>
          <Step n="03" title="CRM-tracked ROI">Every lead and sale is tied back to its campaign, so you see cost per lead and real return, not vanity metrics.</Step>
          <Step n="04" title="Leads that get followed up">Because we build the whole stack, ad leads flow into automated follow-up and booking — so they don&rsquo;t die on arrival.</Step>
        </CardGrid>
        <Prose>
          This is the difference between &ldquo;running ads&rdquo; and running a measured acquisition engine. The ads bring the
          lead, your CRM proves the value, and your automation makes sure the lead actually gets worked — one connected loop,
          not three disconnected tools.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Get my free ad-spend audit" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll find the waste.</span>
        </div>
      </Section>

      {/* WHAT'S INCLUDED */}
      <Section alt>
        <Eyebrow>What&rsquo;s included</Eyebrow>
        <SectionTitle>Everything that turns spend into tracked revenue.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="Strategy & channel mix">Where to spend, on which platforms, for your specific buyers and margins.</Step>
          <Step title="Creative production">Ad images, video and copy, produced and refreshed so performance doesn&rsquo;t fatigue.</Step>
          <Step title="Continuous testing">Systematic A/B testing of audiences, creative and offers to drive cost per lead down.</Step>
          <Step title="Conversion tracking">Pixels, events and CRM attribution set up properly so the data is trustworthy.</Step>
          <Step title="Lead follow-up">Ad leads flow into automated follow-up and booking, not a spreadsheet nobody checks.</Step>
          <Step title="Clear reporting">Leads, cost per lead, and revenue by channel — the numbers that actually decide budget.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we start</Eyebrow>
        <SectionTitle>From audit to profitable spend.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Audit">We review your current spend, tracking and results, and find where budget is leaking.</Step>
          <Step n="2" title="Set up tracking">We wire pixels and CRM attribution so results become measurable from day one.</Step>
          <Step n="3" title="Launch & test">We launch the right channel mix with tested creative and gather real conversion data.</Step>
          <Step n="4" title="Scale winners">We cut what doesn&rsquo;t convert and scale what does, lowering your cost per customer.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What measured ads look like in practice.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A local service business was spending on boosted posts with no idea which brought customers, so budget went to whatever looked busy.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> Proper conversion tracking + CRM attribution, a focused channel mix, and continuously tested creative — plus automated follow-up on every ad lead.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> With spend now tied to real leads and revenue, budget shifts to the campaigns that actually sell, and cost per customer trends down instead of guessed at.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See the loop</Eyebrow>
        <SectionTitle>60 seconds: from ad click to tracked, followed-up lead.</SectionTitle>
        <VideoSlot label="ad-to-CRM attribution walkthrough" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>Measured ads vs. boosting and hoping.</SectionTitle>
        <CompareTable
          columns={["Vantage Stack", "Boost & hope"]}
          rows={[
            { label: "Tracks real leads + revenue", cells: [{ tone: "yes", text: "Yes, in your CRM" }, { tone: "no", text: "Clicks & reach only" }] },
            { label: "Creative testing", cells: [{ tone: "yes", text: "Continuous" }, { tone: "no", text: "Set and forget" }] },
            { label: "Channel choice", cells: [{ tone: "yes", text: "Based on your buyers" }, { tone: "no", text: "One template" }] },
            { label: "Lead follow-up", cells: [{ tone: "yes", text: "Automated" }, { tone: "no", text: "Not their job" }] },
            { label: "You can see ROI", cells: [{ tone: "yes", text: "Cost per lead + return" }, { tone: "no", text: '"Engagement is up"' }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Paid ads, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "How much should a small business spend on paid ads?", a: "It depends on your margins and average deal value. We start with a budget that gathers real conversion data, then scale spend only on what proves profitable — so you buy leads and revenue, not just clicks." },
            { q: "Which platform is best — Facebook, Google or LinkedIn?", a: "It depends on your customer. Google captures active searchers; Facebook and Instagram create demand and retarget; LinkedIn works for B2B. We pick the mix based on where your buyers are." },
            { q: "How do I know if my ads are actually working?", a: "By tracking leads and revenue, not vanity metrics. We wire your ads to your CRM so every lead and sale is attributed to its campaign — you see cost per lead and return." },
            { q: "Do you handle the ad creative too?", a: "Yes — we produce and continuously test creative, because it's usually the biggest lever on performance." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section alt>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who gets the most from managed paid ads.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> If you&rsquo;re already spending on ads (or ready to) but can&rsquo;t clearly see
          which spend makes money, this pays for itself by cutting waste and scaling what works — turning a guess into a
          measured engine.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={2}>
          <Step title="You boost and hope">You run ads occasionally with no real tracking or strategy behind them.</Step>
          <Step title="Your reports are vanity metrics">You get reach and engagement, never cost per lead or revenue.</Step>
          <Step title="Leads slip after the click">Ads bring enquiries but follow-up is manual, so many go cold.</Step>
          <Step title="You want to scale safely">You&rsquo;d spend more if you could trust that the spend actually returns.</Step>
        </CardGrid>
        <Prose>
          If two or more land, measured ads will stop the waste and show you exactly where more budget pays off.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>See exactly where your ad budget is working — and where it&rsquo;s leaking.</>}
          cta={<BookCta label="Get my free ad-spend audit" />}
        >
          Book a free ad-spend audit. We&rsquo;ll review your spend and tracking, show you what&rsquo;s really converting, and
          where more budget would actually pay off.
        </FinalCta>
      </Section>
    </>
  );
}
