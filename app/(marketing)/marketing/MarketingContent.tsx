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
  Faq,
  ImageSlot,
  VideoSlot,
  FinalCta,
  HeroMock,
} from "../../../components/marketing/primitives";

// Body sections only — the (marketing) layout provides the real Navbar + Footer.
// Copy + JSON-LD carried from the source spec; rendered through the real design
// system. Booking → Cal.com (confirmed). Umbrella page — no comparison table;
// a service grid links the individual service pages instead.

function Section({ alt = false, id, children }: { alt?: boolean; id?: string; children: ReactNode }) {
  return (
    <section id={id} className={`vs-section ${alt ? "border-t border-white/5 bg-black/40" : ""}`}>
      <div className="vs-container">
        <Reveal>{children}</Reveal>
      </div>
    </section>
  );
}

// The nine service pages this umbrella page links to. Copy taken verbatim from
// the source service grid; routes/labels per the page set.
const SERVICES: { href: string; name: string; desc: string }[] = [
  { href: "/ai-calling", name: "AI Voice Agents", desc: "Answer every call, qualify, and book 24/7." },
  { href: "/system-automations", name: "System Automations", desc: "Capture every lead and automate follow-up." },
  { href: "/whatsapp-assistant", name: "WhatsApp & Teams Assistant", desc: "Answer, book and pull data — in chat, 24/7." },
  { href: "/personal-ai-assistant", name: "Personal AI Assistant", desc: "Your inbox, calendar and admin, handled." },
  { href: "/website-design", name: "Website Design", desc: "Fast, mobile-first sites built to convert." },
  { href: "/paid-ads", name: "Paid Ads Management", desc: "Ads measured in leads and rands, not clicks." },
  { href: "/social-media-management", name: "Social Media Management", desc: "Consistent, on-brand content that builds trust." },
  { href: "/workflow-automation", name: "AI Workflow Automation", desc: "The repetitive work, done on its own." },
  { href: "/custom-software", name: "Custom Software", desc: "The exact tool your business needs, built." },
];

export function MarketingContent() {
  return (
    <>
      {/* HERO */}
      <header className="vs-section">
        <div className="vs-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <Reveal className="space-y-5">
              <Pill>Growth Systems · South Africa</Pill>
              <HeroRating />
              <h1 className="font-heading text-[34px] font-medium leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Not a marketing agency. A <span className="text-accent">revenue engine</span> for your business.
              </h1>
              <p className="max-w-xl text-base text-textMuted md:text-lg">
                Vantage Stack combines AI calling, CRM automation, WhatsApp assistants, websites, paid ads, social and
                workflow automation into one connected system — so attention turns into booked business instead of leaking
                through the gaps. We solve one problem: your business losing time and revenue to disconnected tools and slow
                follow-up.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-textPrimary/80">
                <span>✔ One connected system</span>
                <span>✔ Start where it leaks most</span>
                <span>✔ Built for SA SMBs</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCta label="Get my Growth Blueprint" />
                <span className="text-xs text-textMuted/70">Free — we map where your revenue leaks.</span>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <HeroMock
                title="Revenue System™"
                tag="Capture → Qualify → Scale"
                rows={[
                  { n: "1", t: "Capture", s: "Every call, DM & enquiry caught" },
                  { n: "2", t: "Qualify", s: "AI books & follows up, CRM tracks" },
                  { n: "3", t: "Scale", s: "Ads, social & automation compound" },
                  { n: "✓", t: "Booked revenue", s: "Nothing leaks between the tools", done: true },
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
            'A single connected growth engine: website, phone, WhatsApp, CRM, ads and social all linked by glowing blue lines into one flow that ends in booked revenue. Near-black #0B0B0C background, electric-blue #3B82F6 accents, glassy modern tech aesthetic, no readable text.'
          }
        />
      </div>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <SectionTitle>You don&rsquo;t have a marketing problem. You have a leaking system.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Most small businesses aren&rsquo;t short of leads — they&rsquo;re losing the ones
          they have in the gaps between disconnected tools. The website doesn&rsquo;t talk to the CRM, the ads aren&rsquo;t
          tracked, the calls get missed, the follow-up depends on memory. Each tool works alone; nothing works together. So
          revenue leaks quietly at every seam.
        </AnswerBox>
        <Prose>
          It&rsquo;s a familiar picture: a bit of Facebook, a website someone built once, a WhatsApp full of half-answered
          enquiries, a spreadsheet pretending to be a CRM, and follow-up that happens when there&rsquo;s time. Every piece is
          separate, so a lead has a dozen places to fall through — and it usually does.
        </Prose>
        <Prose>
          Throwing more tactics at it doesn&rsquo;t fix it. More ads into a leaky funnel just means more expensive leaks. The
          problem isn&rsquo;t that you need to <em>do</em> more marketing — it&rsquo;s that what you already do needs to work
          as one connected system.
        </Prose>
      </Section>

      {/* AGITATE */}
      <Section alt>
        <Eyebrow>What it&rsquo;s costing you</Eyebrow>
        <SectionTitle>Disconnected tools bleed revenue at every gap.</SectionTitle>
        <StatBand>
          <StatCard big="3–5">disconnected tools a typical SMB juggles</StatCard>
          <StatCard big="18–25">hrs/week lost to manual glue between them</StatCard>
          <StatCard big="21×">more likely to qualify a lead answered in 5 min</StatCard>
        </StatBand>
        <Prose>
          Every seam is a leak: the missed call nobody returned, the ad click that was never tracked, the enquiry that sat in
          WhatsApp, the lead that never got followed up. Individually small; together, a steady drain of the exact revenue you
          spent money and effort to create.
        </Prose>
        <Prose>
          And it caps you. When growth means bolting on another disconnected tool and more manual hours, scaling gets harder
          and more fragile. A connected system does the opposite — it makes every extra lead easier to capture, qualify and
          convert.
        </Prose>
        <ImageSlot
          label="INFOGRAPHIC"
          prompt={
            'Clean data-viz infographic — a leaky pipeline of disconnected tools losing revenue at each gap vs one sealed connected system delivering booked revenue. Near-black #0B0B0C background, electric-blue #3B82F6 accents, minimal modern style, sparse labels — matches Vantage Stack aesthetic.'
          }
        />
      </Section>

      {/* SOLVE / SERVICES GRID */}
      <Section>
        <Eyebrow>The solution</Eyebrow>
        <SectionTitle>One connected system — every part working together.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Vantage Stack builds your growth as one system, not a pile of tactics. Each service
          below plugs into the same engine — so a click becomes a captured lead, a lead becomes a booked customer, and nothing
          leaks in between. Start with your biggest leak; expand as each piece pays for itself.
        </AnswerBox>
        <CardGrid cols={3}>
          {SERVICES.map((s) => (
            <a key={s.href} href={s.href} className="vs-card vs-card-hover border border-white/10">
              <h3 className="font-heading text-base text-textPrimary/95">{s.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-textMuted/90 md:text-sm">{s.desc}</p>
              <span className="mt-2.5 inline-block text-xs font-medium text-accent">Explore →</span>
            </a>
          ))}
        </CardGrid>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <BookCta label="Get my Growth Blueprint" />
          <span className="text-xs text-textMuted/70">We&rsquo;ll show you where to start.</span>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section alt>
        <Eyebrow>How we start</Eyebrow>
        <SectionTitle>The Growth Blueprint finds your biggest leak first.</SectionTitle>
        <CardGrid cols={4}>
          <Step n="1" title="Blueprint">We map how leads move through your business and find where revenue leaks most.</Step>
          <Step n="2" title="Fix the biggest leak">Usually AI call handling, CRM capture and follow-up — the fastest recovered-revenue win.</Step>
          <Step n="3" title="Connect the stack">Website, ads, social and automation plug into the same engine, one piece at a time.</Step>
          <Step n="4" title="Compound">Each connected piece makes the next more valuable — the system scales your revenue.</Step>
        </CardGrid>
      </Section>

      {/* VIDEO */}
      <Section>
        <Eyebrow>See the system</Eyebrow>
        <SectionTitle>60 seconds: a lead moving through the whole engine.</SectionTitle>
        <VideoSlot label="Capture → Qualify → Scale" />
      </Section>

      {/* FAQ */}
      <Section alt>
        <Eyebrow>Questions</Eyebrow>
        <SectionTitle>The growth system, answered plainly.</SectionTitle>
        <Faq
          items={[
            { open: true, q: "Is Vantage Stack a marketing agency?", a: "No. We're a business automation and growth company. We solve one problem: teams losing time and revenue to slow follow-up, missed enquiries and disconnected tools — by building a connected system, not just running campaigns." },
            { q: "Do I have to buy everything at once?", a: "No. We start with the biggest leak — usually AI call handling, CRM capture and follow-up — and expand into website, ads, social and automation as each piece pays for itself." },
            { q: "How do I know where to start?", a: "With the free Growth Blueprint. We map how leads move through your business, find where they leak, and show you the highest-value fix first." },
            { q: "Why does everything connecting matter?", a: "Because leads leak in the gaps between disconnected tools. When your website, calling, CRM, WhatsApp, ads and follow-up share one system, an enquiry becomes a tracked, worked, booked customer instead of a dropped ball." },
          ]}
        />
      </Section>

      {/* WHO IT'S FOR */}
      <Section>
        <Eyebrow>Is this you?</Eyebrow>
        <SectionTitle>Who a connected growth system is built for.</SectionTitle>
        <AnswerBox>
          <strong>Short answer:</strong> Small South African businesses (teams under 50, still growing) running on a handful
          of disconnected tools and manual follow-up — generating real interest but losing it in the gaps. If that&rsquo;s
          you, connecting the system recovers revenue you&rsquo;re already creating.
        </AnswerBox>
        <Prose>Especially strong if you recognise a couple of these:</Prose>
        <CardGrid cols={4}>
          <Step title="Disconnected tools">Website, WhatsApp, CRM, ads and social all live separately.</Step>
          <Step title="Leads leak">Missed calls, slow follow-up and untracked ads bleed revenue.</Step>
          <Step title="Admin eats the week">Hours lost to manual glue between tools.</Step>
          <Step title="You want to scale">But adding more tactics just adds more leaks and cost.</Step>
        </CardGrid>
        <Prose>
          If two or more land, a connected growth system will recover the revenue you&rsquo;re already generating — and make
          every future lead easier to convert.
        </Prose>
      </Section>

      {/* FINAL CTA */}
      <Section id="book">
        <FinalCta
          eyebrow="Your move"
          title={<>See where your revenue leaks — and the fastest fix. Free.</>}
          cta={<BookCta label="Get my Growth Blueprint" />}
        >
          Get your Growth Blueprint. We&rsquo;ll map how leads move through your business, show you exactly where revenue
          leaks, and the highest-value place to start.
        </FinalCta>
      </Section>
    </>
  );
}
