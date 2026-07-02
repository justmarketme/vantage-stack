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

export function SocialMediaManagementContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>Social Media Management · South Africa</Pill>
              <HeroRating />
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Social that builds trust and <span className="text-accent">brings enquiries</span> — not just likes.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack runs your social media with real strategy and consistency — on-brand content and UGC-style
                video that keep you visible, build trust, and quietly turn followers into enquiries. All the presence, none
                of the &ldquo;I&rsquo;ll post when I have time&rdquo;.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ Strategy-led</span>
                <span>✔ Consistent &amp; on-brand</span>
                <span>✔ UGC + video</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Get my free content audit" />
                <span className="text-xs text-textMuted/70">We&rsquo;ll show what&rsquo;s working and what&rsquo;s missing.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Content Engine"
                tag="Illustrative"
                rows={[
                  { n: "1", t: "Strategy set", s: "Themes tied to your goals" },
                  { n: "2", t: "Content created", s: "On-brand posts + UGC video" },
                  { n: "3", t: "Scheduled & posted", s: "Consistent, every week" },
                  { n: "✓", t: "Trust → enquiries", s: "Followers become customers", done: true },
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
            'A vibrant, consistent social feed of on-brand posts and short videos flowing from a content engine, building an engaged audience. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech aesthetic, South African feel, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>Your social is either silent — or busy but going nowhere.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Most small businesses fall into one of two traps: they post nothing for weeks
          because there&rsquo;s no time, or they post randomly with no strategy, so it eats effort without bringing business.
          Either way, social becomes a chore that doesn&rsquo;t pay off — a channel that should build trust just gathers dust.
        </AnswerBox>
        <Prose>
          You know it matters. Customers check you out on Instagram or Facebook before they buy or book — an empty, outdated
          feed quietly costs you trust. But keeping it fed is relentless: ideas, captions, images, video, scheduling,
          replying. So it slips, the account goes quiet, and the impression it leaves is &ldquo;are they even still going?&rdquo;
        </Prose>
        <Prose>
          And when you do post, it&rsquo;s often &ldquo;content for content&rsquo;s sake&rdquo; — a nice photo with no purpose.
          It fills the feed but doesn&rsquo;t move anyone toward becoming a customer. Effort in, likes maybe, but no
          measurable business out.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>An invisible brand loses to a visible one — every time.</SectionTitle>
        <StatBand>
          <StatCard big="1st">place people check you out is social</StatCard>
          <StatCard big="80%+">of buyers research before they enquire</StatCard>
          <StatCard big="0">trust built by a feed that&rsquo;s gone quiet</StatCard>
        </StatBand>
        <Prose>
          When a potential customer finds your competitor posting consistently — sharing proof, answering questions, showing
          the work — and finds you last active three months ago, the choice is half-made before you&rsquo;ve even spoken.
          Presence is a trust signal, and absence is one too.
        </Prose>
        <Prose>
          It compounds like a relationship. Consistent, valuable content keeps you top of mind so that when someone&rsquo;s
          ready to buy, you&rsquo;re the obvious call — and the easy referral. Silence hands all of that to whoever kept
          showing up.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — two brand timelines: one with sporadic gaps and flat trust, one with steady consistent posts and rising trust/enquiries. Near-black #0B0B0C background, electric-blue #3B82F6 accents, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>A content engine that runs your social — with purpose.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack takes social off your plate and runs it properly: a strategy tied to
          your business goals, consistent on-brand content and UGC-style video, scheduled across the platforms your customers
          use — all built to grow trust and turn attention into enquiries, with you approving along the way.
        </AnswerBox>
        <CardGrid cols={2}>
          <Step n="01" title="Strategy, not guessing">Content themes tied to real goals — trust, visibility and enquiries — not random posts.</Step>
          <Step n="02" title="Consistent & on-brand">A reliable flow of content in your voice and look, so your feed never goes quiet.</Step>
          <Step n="03" title="UGC & short-form video">The formats that actually perform now — authentic, scroll-stopping, made for your brand.</Step>
          <Step n="04" title="Tied to your business">Social connects to your website, WhatsApp assistant and follow-up, so interest becomes a lead.</Step>
        </CardGrid>
        <Prose>
          Because Vantage Stack builds the whole stack, your social isn&rsquo;t a stranded channel — it feeds your funnel. A
          comment or DM can flow to your WhatsApp assistant, an enquiry into your CRM. Attention turns into booked business,
          not just a growing follower count.
        </Prose>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Get my free content audit" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll map the gaps and the wins.</span>
        </div>
      </Section>

      {/* WHAT WE DO */}
      <Section alt>
        <Eyebrow>What we handle</Eyebrow>
        <SectionTitle>Everything that keeps your social alive and working.</SectionTitle>
        <CardGrid cols={2}>
          <Step title="Content strategy">A monthly plan of what to post and why, mapped to your goals and season.</Step>
          <Step title="Content creation">On-brand graphics, captions and short-form video, ready to go.</Step>
          <Step title="UGC-style video">Authentic, native-feeling video — the format that wins attention now.</Step>
          <Step title="Scheduling">Consistent posting across the platforms your customers actually use.</Step>
          <Step title="Community basics">Comments and DMs handled and routed, so engagement doesn&rsquo;t go cold.</Step>
          <Step title="Reporting">What&rsquo;s growing, what&rsquo;s driving enquiries — the numbers that matter, not vanity.</Step>
        </CardGrid>
      </Section>

      {/* HOW IT WORKS */}
      <Section>
        <Eyebrow>How we start</Eyebrow>
        <SectionTitle>From content audit to a feed that works.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Audit">We review your current social and competitors, and find the gaps and opportunities.</Step>
          <Step n="2" title="Strategy">We build a content plan tied to your goals and brand voice.</Step>
          <Step n="3" title="Create & schedule">We produce on-brand content and UGC, you approve, we schedule it.</Step>
          <Step n="4" title="Grow & report">We keep it consistent, track what drives enquiries, and refine.</Step>
        </CardGrid>
      </Section>

      {/* CASE STUDY */}
      <Section alt>
        <Eyebrow>Proof</Eyebrow>
        <SectionTitle>What consistent, purposeful social looks like.</SectionTitle>
        <CaseBox>
          <p className="mt-0 font-semibold text-textPrimary">[CASE STUDY — representative, pending sign-off]</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Problem:</strong> A business posted sporadically with no strategy, so its social built little trust and drove no enquiries, while competitors showed up consistently.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Solution:</strong> A strategy-led content engine — consistent on-brand posts and UGC video tied to goals, connected to their enquiry funnel.</p>
          <p className="mt-3 text-sm text-textMuted md:text-base"><strong className="text-textPrimary">Results (illustrative):</strong> A living, trusted feed that keeps the brand top of mind and turns attention into DMs and enquiries — presence that pays off instead of a chore.</p>
        </CaseBox>
        <ReviewFlag>Swap for an approved anonymized case study from case_studies/.</ReviewFlag>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See the engine</Eyebrow>
        <SectionTitle>60 seconds: from content plan to enquiries.</SectionTitle>
        <VideoSlot label="a content engine in motion" />
      </Section>

      {/* COMPARISON */}
      <Section alt>
        <Eyebrow>Honest comparison</Eyebrow>
        <SectionTitle>Managed &amp; strategic vs. posting when you can.</SectionTitle>
        <CompareTable
          columns={["Vantage Stack", "DIY / when there's time"]}
          rows={[
            { label: "Consistency", cells: [{ tone: "yes", text: "Every week" }, { tone: "no", text: "Sporadic" }] },
            { label: "Strategy", cells: [{ tone: "yes", text: "Tied to goals" }, { tone: "no", text: "Random posts" }] },
            { label: "UGC + video", cells: [{ tone: "yes", text: "Core" }, { tone: "no", text: "Rare" }] },
            { label: "Drives enquiries", cells: [{ tone: "yes", text: "Connected to funnel" }, { tone: "no", text: "Likes only" }] },
            { label: "Your time", cells: [{ tone: "yes", text: "Just approve" }, { tone: "no", text: "Eats your week" }] },
          ]}
        />
      </Section>

      {/* FAQ */}
      <Section>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>Social media management, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "Does social media actually bring in business?", a: "When it's strategic, yes. Consistent, on-brand content builds the trust and familiarity that make people choose and refer you. We tie social to real goals — enquiries and bookings — not just likes." },
            { q: "What do you actually post?", a: "A mix planned around your business: educational content, proof and results, behind-the-scenes, offers, and UGC-style video — in your brand voice, on the platforms your customers use." },
            { q: "How much of my time does it take?", a: "Very little. We handle strategy, content and scheduling; you approve. The point is to take social off your plate while keeping it authentically yours." },
            { q: "Do you do UGC and video?", a: "Yes. Short-form video and UGC-style content perform best on most platforms now, so it's a core part of what we produce." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section alt>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who gets the most from managed social.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> If your social is inconsistent or aimless and you don&rsquo;t have time to fix it, a
          strategy-led content engine keeps you visible and trusted — and turns that presence into enquiries — without eating
          your week.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={2}>
          <Step title="Your feed's gone quiet">Weeks between posts because there&rsquo;s never time.</Step>
          <Step title="Posting without a plan">Effort in, but no strategy and no business out.</Step>
          <Step title="Competitors outshine you">They show up consistently and you don&rsquo;t.</Step>
          <Step title="No video / UGC">You&rsquo;re missing the formats that actually perform.</Step>
        </CardGrid>
        <Prose>
          If two or more land, handing social to a strategy-led engine will build the trust that turns followers into customers.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>See what your social could be doing — free content audit.</>}
          cta={<BookCta label="Get my free content audit" />}
        >
          Book a free content audit. We&rsquo;ll review your social and your competitors&rsquo;, show you the gaps, and how a
          strategy-led engine would turn presence into enquiries.
        </FinalCta>
      </Section>
    </>
  );
}
