"use client";

import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";

// ───────────────────────────────────────────────────────────────────────────
// /ai-calling page body. Copy is carried over verbatim from Cowork's draft
// (HO-2026-07-01-001) — Cowork owns the words; this file only turns them into
// site-native React using the existing design system (Space Grotesk + Inter,
// dark theme, blue accent, vs-* utilities).
//
// DESIGN NOTE: the source HTML was a standalone light-theme / orange-accent
// page. It has been adapted to the app's dark theme + blue accent so it matches
// the rest of the site (Navbar/Footer, vs-* classes) rather than looking like a
// bolted-on microsite. Copy and the JSON-LD schema are unchanged.
//
// Every >>> REVIEW item from the draft is rendered as a visible <ReviewFlag> so
// it is obvious on-page that this is not publish-ready.
// ───────────────────────────────────────────────────────────────────────────

// Cal.com booking — the site's canonical discovery-call flow (same as homepage).
const CAL_LINK = "vantagestack/discovery-call";

function useCalEmbed() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as any;
    if (win.Cal?.loaded) return;
    (function (C: any, A: string, L: string) {
      const p = (a: any, ar: any) => {
        a.q.push(ar);
      };
      const d = C.document;
      C.Cal =
        C.Cal ||
        function (...args: any[]) {
          const cal = C.Cal;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            const s = d.createElement("script");
            s.src = A;
            d.head.appendChild(s);
            cal.loaded = true;
          }
          if (args[0] === L) {
            const api: any = (...a: any[]) => {
              p(api, a);
            };
            const ns = args[1];
            api.q = api.q || [];
            if (typeof ns === "string") {
              cal.ns[ns] = cal.ns[ns] || api;
              p(cal.ns[ns], args);
              p(cal, ["-queue", ns]);
            } else {
              p(cal, args);
            }
            return;
          }
          p(cal, args);
        };
    })(win, "https://app.cal.com/embed/embed.js", "init");
    win.Cal("init", "discovery", { origin: "https://app.cal.com" });
  }, []);
}

function BookCallButton({
  className = "",
  label = "Book a 30-minute strategy call",
}: {
  className?: string;
  label?: string;
}) {
  useCalEmbed();
  return (
    <button
      data-cal-namespace="discovery"
      data-cal-link={CAL_LINK}
      data-cal-config='{"layout":"popup"}'
      className={className}
    >
      <Calendar size={15} className="mr-1.5 -mt-0.5 inline-block" />
      {label} →
    </button>
  );
}

// Visible marker for unresolved >>> REVIEW items. Makes it unmistakable on-page
// that the section is not final.
function ReviewFlag({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90">
      <span className="mt-px font-semibold uppercase tracking-[0.14em] text-amber-300">
        ⚠ Review
      </span>
      <span className="text-amber-100/80">{children}</span>
    </div>
  );
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// "Short answer" GEO callout rendered under key H2s (AI-citation friendly).
function AnswerBox({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 rounded-r-xl border-l-2 border-accent bg-white/[0.03] px-5 py-4 text-sm text-textPrimary/90 md:text-base">
      {children}
    </div>
  );
}

const Stat = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold text-accent">{children}</span>
);

export function AiCallingContent() {
  return (
    <div className="relative">
      <Navbar />

      <main className="pt-28">
        {/* ================= HERO / HOOK ================= */}
        <header className="vs-section">
          <div className="vs-container">
            <Reveal className="max-w-3xl space-y-6">
              <p className="vs-section-heading">AI Voice Agents · South Africa</p>
              <h1 className="font-heading text-[34px] leading-tight md:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Every missed call is a customer calling your{" "}
                <span className="text-accent">competitor</span> instead.
              </h1>
              <p className="max-w-2xl text-sm text-textMuted md:text-base">
                Vantage Stack builds AI voice agents that answer every call, qualify the lead, and
                book the appointment — 24/7, in a natural South African voice. No voicemail. No
                &ldquo;we&rsquo;ll call you back.&rdquo; No lost deals.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-textMuted">
                <span>✔ POPIA-compliant</span>
                <span>✔ Works through load-shedding</span>
                <span>✔ Books into your calendar</span>
                <span>✔ Local calling infrastructure</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCallButton className="vs-button-primary text-sm" />
                <span className="text-xs text-textMuted/70">
                  See your own &ldquo;missed-call cost&rdquo; live on the call.
                </span>
              </div>
              {/* >>> REVIEW: booking link (hero) */}
              <ReviewFlag>
                Booking currently opens the site&rsquo;s standard Cal.com discovery-call flow
                (<code className="text-amber-200">{CAL_LINK}</code>). Confirm this is the right
                destination for /ai-calling, or supply a dedicated Calendly / WhatsApp link.
              </ReviewFlag>
            </Reveal>
          </div>
        </header>

        {/* ================= PROBLEM (~500w) ================= */}
        <section className="vs-section border-t border-white/5 bg-black/40">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">The problem</p>
              <h2 className="vs-section-title">
                Your phone is your best salesperson — and it&rsquo;s off half the time.
              </h2>
              <AnswerBox>
                <strong>Short answer:</strong> Most South African small businesses miss between a
                fifth and a third of their inbound calls, and the majority of missed callers never
                call back — they call the next result on Google. An AI voice agent answers 100% of
                those calls instantly, so no enquiry ever goes to a competitor by default.
              </AnswerBox>
              <div className="space-y-4 text-sm leading-relaxed text-textMuted md:text-base">
                <p>
                  Think about how leads actually reach you. Someone sees your ad, gets a referral, or
                  finds you on Google. They&rsquo;re interested <em>right now</em>. They pick up the
                  phone. And then one of a dozen ordinary things happens: you&rsquo;re on a job, on
                  another call, driving, with a client, or it&rsquo;s 7pm and everyone&rsquo;s gone
                  home. It rings out. Maybe they leave a voicemail. Usually they don&rsquo;t.
                </p>
                <p>
                  Here&rsquo;s the uncomfortable part. That caller was ready. By the time you see the
                  missed call and phone back — two hours later, or the next morning — the moment is
                  gone. They&rsquo;ve moved on, and moved on usually means they called the next
                  business on the list. You never even knew they existed as a lead. There&rsquo;s no
                  line item on your P&amp;L for &ldquo;revenue that phoned once and gave up,&rdquo;
                  which is exactly why it bleeds unnoticed, month after month.
                </p>
                <p>
                  And it&rsquo;s not just after-hours. During the day, a single person juggling
                  reception, quotes, and actual work simply cannot answer every call within seconds.
                  Add load-shedding — office power drops, the desk phone dies, calls vanish into the
                  void — and the leak gets worse at precisely the times demand can spike.
                </p>
                <p>
                  The old fixes don&rsquo;t really fix it. Voicemail converts terribly; most people
                  hang up on it. A part-time receptionist costs real money, still only covers
                  business hours, and still can&rsquo;t be in two conversations at once. An answering
                  service reads from a generic script, doesn&rsquo;t know your calendar, and
                  can&rsquo;t book anything. Every one of these is a patch over the same hole:{" "}
                  <strong className="text-textPrimary">
                    the call has to be answered instantly, every time, or the lead is gone.
                  </strong>
                </p>
                <p>
                  This is the single most expensive, most invisible problem in a small service
                  business. You&rsquo;re spending on ads and referrals to make the phone ring, then
                  letting a meaningful share of those hard-won calls fall straight through the floor.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================= AGITATE (~600w, rand-cost) ================= */}
        <section className="vs-section bg-gradient-to-b from-black/40 via-slate-950/60 to-black">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">What it&rsquo;s actually costing you</p>
              <h2 className="vs-section-title">
                Let&rsquo;s put a rand figure on the calls you&rsquo;re missing.
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-textMuted md:text-base">
                <p>
                  Vague &ldquo;you&rsquo;re losing business&rdquo; warnings are easy to ignore. So
                  let&rsquo;s do the maths with real numbers you can plug your own figures into.
                </p>
                <div className="vs-card border border-white/10">
                  <p className="mt-0 font-medium text-textPrimary">The missed-call cost formula:</p>
                  <p className="text-base md:text-lg">
                    <Stat>
                      Missed calls / month × Close rate × Average deal value = Revenue walking out
                      the door.
                    </Stat>
                  </p>
                  <p>
                    Say you miss just <strong className="text-textPrimary">4 calls a week</strong> —
                    modest for most businesses. That&rsquo;s ~17 a month. If even{" "}
                    <strong className="text-textPrimary">1 in 4</strong> would have become a
                    customer, and your average job is worth{" "}
                    <strong className="text-textPrimary">R6,000</strong>, that&rsquo;s{" "}
                    <Stat>17 × 25% × R6,000 = R25,500 in lost revenue every single month.</Stat> Over
                    a year: more than <strong className="text-textPrimary">R300,000</strong> — gone,
                    silently, to whoever answered their phone.
                  </p>
                </div>
                {/* >>> REVIEW: ROI example numbers */}
                <ReviewFlag>
                  Confirm the illustrative maths (4 calls/week × 25% close × R6,000 deal →
                  R25,500/mo), or replace with your real client averages before publish.
                </ReviewFlag>
                <p>
                  Now here&rsquo;s why speed is the whole game, backed by the data every serious
                  sales team already knows:
                </p>
                <p>
                  Leads contacted within <strong className="text-textPrimary">5 minutes</strong> are{" "}
                  <Stat>21× more likely</Stat> to qualify than leads contacted after 30 minutes.
                  Respond in about a minute and you can see up to a <Stat>391% lift</Stat> in
                  conversions. Let follow-up slip by just five minutes and conversion can fall{" "}
                  <Stat>8×</Stat>. Speed isn&rsquo;t a nice-to-have — it&rsquo;s the difference
                  between winning and losing the exact same lead.
                </p>
                <p>
                  And the bar in the market is astonishingly low. Studies of large samples of
                  companies find the <em>average</em> first response to an inbound lead is around{" "}
                  <Stat>42 hours</Stat>, over 60% of businesses never respond at all, and only about{" "}
                  <strong className="text-textPrimary">0.1%</strong> manage to engage a new lead
                  within five minutes. Read that again: essentially <em>nobody</em> answers fast.
                  Which means the moment you do, you&rsquo;re not competing on price or brand —
                  you&rsquo;re simply the only business that picked up while the customer still cared.
                </p>
                <p>
                  This is the trap. You can&rsquo;t clone yourself. You can&rsquo;t answer at 9pm on a
                  Sunday, or during stage-6 load-shedding, or while you&rsquo;re already on another
                  call. So the leak stays open, you keep paying to fill the top of the funnel, and a
                  chunk of it keeps draining out the bottom. Every week you wait, that R25,500 example
                  walks out again.
                </p>
                <p>
                  The good news: this is a <em>solved</em> problem. It just needs something that never
                  sleeps, never gets busy, and answers on the first ring — every time.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================= SOLVE (~800w) ================= */}
        <section className="vs-section">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">The solution</p>
              <h2 className="vs-section-title">
                An AI voice agent that answers every call and books the meeting for you.
              </h2>
              <AnswerBox>
                <strong>Short answer:</strong> Vantage Stack builds you a custom AI voice agent — a
                natural-sounding South African voice that answers and makes calls, qualifies the
                caller, handles your common questions, and books confirmed appointments straight into
                your calendar. It runs 24/7, handles many calls at once, and never has an off day.
              </AnswerBox>
              <div className="space-y-4 text-sm leading-relaxed text-textMuted md:text-base">
                <p>
                  This isn&rsquo;t a generic chatbot with a phone number bolted on. We build the agent
                  around <em>your</em> business: your services, your pricing rules, your qualifying
                  questions, your calendar, your tone. To your caller, it simply sounds like a sharp,
                  friendly team member who happens to be available instantly, at any hour.
                </p>
                <p>Here&rsquo;s what it does the moment a call comes in — inbound or outbound:</p>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  {
                    n: "01",
                    title: "Answers on the first ring",
                    body: "Every call, every time — 6am, midnight, mid-load-shedding. No voicemail, no hold music, no lost lead.",
                  },
                  {
                    n: "02",
                    title: "Qualifies the lead",
                    body: "Asks your questions, captures the details, and figures out whether this is a hot lead, a quick FAQ, or a job for a human.",
                  },
                  {
                    n: "03",
                    title: "Books the appointment",
                    body: "Checks your real calendar availability, books the slot, and fires off a WhatsApp or SMS confirmation instantly.",
                  },
                  {
                    n: "04",
                    title: "Logs it to your CRM",
                    body: "Every call, transcript, and outcome flows into your system — so nothing lives only in someone's memory.",
                  },
                ].map((s) => (
                  <div key={s.n} className="vs-card border border-white/10">
                    <div className="font-heading text-2xl font-semibold text-accent">{s.n}</div>
                    <h3 className="mt-1 font-heading text-base text-textPrimary/95">{s.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-textMuted/90 md:text-sm">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-4 text-sm leading-relaxed text-textMuted md:text-base">
                <p>
                  And because Vantage Stack isn&rsquo;t a single-trick vendor, the voice agent
                  doesn&rsquo;t sit on an island. It plugs into the rest of your stack — your CRM, your
                  WhatsApp assistant, your follow-up workflows — so a booked call automatically
                  triggers reminders, follow-ups, and the next step, with no one lifting a finger.
                  That&rsquo;s the difference between buying a gadget and installing a system.
                </p>
                <h3 className="pt-2 font-heading text-lg text-textPrimary">
                  Built for South African realities
                </h3>
                <p>
                  <strong className="text-textPrimary">Load-shedding-proof.</strong> The agent lives
                  in the cloud on redundant infrastructure with backup power. Your office can go dark;
                  your calls still get answered. You never lose a customer because Eskom had a bad day.
                </p>
                <p>
                  <strong className="text-textPrimary">POPIA-compliant by design.</strong> Consent
                  handling, call disclosure, and secure storage of personal information are configured
                  into every deployment — not an afterthought.
                </p>
                <p>
                  <strong className="text-textPrimary">Local calling infrastructure.</strong> Routing
                  through South African calling infrastructure keeps call quality high and per-minute
                  costs down, rather than bouncing your calls around the world.
                </p>
                <p>
                  <strong className="text-textPrimary">A voice that sounds like home.</strong> A
                  natural South African accent your customers trust — not a flat, obviously-foreign
                  robocall they hang up on in three seconds.
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookCallButton
                  className="vs-button-primary text-sm"
                  label="Show me what my agent would sound like"
                />
                <span className="text-xs text-textMuted/70">
                  We&rsquo;ll demo a live agent on your strategy call.
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section className="vs-section border-t border-white/5 bg-black/40">
          <div className="vs-container">
            <Reveal>
              <p className="vs-section-heading">How we get you live</p>
              <h2 className="vs-section-title max-w-2xl">
                From first call to first booking in about two weeks.
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { n: "1", title: "Map your calls", body: "We learn your top call types, your qualifying questions, your calendar rules, and your tone." },
                  { n: "2", title: "Build & train the agent", body: "We script and voice your custom agent, wire it to your calendar and CRM, and tune it on real scenarios." },
                  { n: "3", title: "Test with you", body: "You call it, break it, and sign off. We refine until it sounds and behaves exactly right." },
                  { n: "4", title: "Go live & optimise", body: "The agent goes live on your line. We watch real calls and keep improving booking rates." },
                ].map((s) => (
                  <div key={s.n} className="vs-card border border-white/10">
                    <div className="font-heading text-2xl font-semibold text-accent">{s.n}</div>
                    <h3 className="mt-1 font-heading text-base text-textPrimary/95">{s.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-textMuted/90 md:text-sm">{s.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================= CASE STUDY SLOT ================= */}
        <section className="vs-section">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">Proof</p>
              <h2 className="vs-section-title">What it looks like in a real business.</h2>
              {/* >>> REVIEW: replace with a real anonymized case study from projects_inventory.json.
                  Keep industry + numbers real, company name anonymous. */}
              <div className="mt-6 rounded-2xl border-2 border-dashed border-accent/50 bg-accent/[0.04] p-6">
                <p className="mt-0 font-semibold text-textPrimary">
                  [CASE STUDY — pending your sign-off]
                </p>
                <p className="mt-3 text-sm text-textMuted md:text-base">
                  <strong className="text-textPrimary">Problem:</strong> A [industry] business was
                  missing ~30% of inbound calls after hours and during busy periods, with no way to
                  know how many leads it was losing.
                </p>
                <p className="mt-3 text-sm text-textMuted md:text-base">
                  <strong className="text-textPrimary">Solution:</strong> Vantage Stack deployed a
                  24/7 AI voice agent that answered every call, qualified callers, and booked
                  consultations into their calendar with instant WhatsApp confirmation.
                </p>
                <p className="mt-3 text-sm text-textMuted md:text-base">
                  <strong className="text-textPrimary">Results:</strong> [X]% of after-hours calls
                  captured that were previously lost · [Y] extra booked appointments per month ·
                  payback in under [Z] weeks.
                </p>
              </div>
              <ReviewFlag>
                Insert the correct anonymized case study and real figures (from
                projects_inventory.json) before this page is published.
              </ReviewFlag>
            </Reveal>
          </div>
        </section>

        {/* ================= EXPLAINER VIDEO SLOT ================= */}
        <section className="vs-section border-t border-white/5 bg-black/40">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">Hear it for yourself</p>
              <h2 className="vs-section-title">
                60 seconds: an AI voice agent booking a real appointment.
              </h2>
              {/* >>> REVIEW: embed explainer video (Google Flow, SA TTS voice) once produced.
                  Save to /images_and_videos/ai-calling/ */}
              <div className="mt-6 flex aspect-video items-center justify-center rounded-2xl border border-white/10 bg-black/60 text-center text-sm font-medium text-textMuted">
                ▶ Explainer video slot — embed the SA-voiced demo here
              </div>
              <ReviewFlag>
                Explainer video not yet produced. Cowork to generate the SA-voiced demo (Google Flow)
                and hand back an embed URL / file.
              </ReviewFlag>
            </Reveal>
          </div>
        </section>

        {/* ================= COMPARISON ================= */}
        <section className="vs-section">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">The honest comparison</p>
              <h2 className="vs-section-title">AI voice agent vs. the alternatives.</h2>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface font-heading text-textPrimary">
                      <th className="border-b border-white/10 px-4 py-3 text-left">&nbsp;</th>
                      <th className="border-b border-white/10 px-4 py-3 text-left">AI Voice Agent</th>
                      <th className="border-b border-white/10 px-4 py-3 text-left">Human Receptionist</th>
                      <th className="border-b border-white/10 px-4 py-3 text-left">Voicemail</th>
                    </tr>
                  </thead>
                  <tbody className="text-textMuted">
                    {[
                      ["Answers 24/7", ["yes", "Yes"], ["no", "Business hours"], ["no", "Never talks"]],
                      ["Instant response", ["yes", "Every call"], ["no", "If free"], ["no", "No"]],
                      ["Handles many calls at once", ["yes", "Yes"], ["no", "One at a time"], ["no", "n/a"]],
                      ["Books into your calendar", ["yes", "Yes"], ["yes", "Sometimes"], ["no", "No"]],
                      ["Works through load-shedding", ["yes", "Yes"], ["no", "If powered"], ["no", "No"]],
                      ["Typical monthly cost", ["yes", "Scoped to volume"], ["no", "R8k–R15k"], ["yes", "Cheap & useless"]],
                    ].map((row) => (
                      <tr key={row[0] as string}>
                        <td className="border-b border-white/10 px-4 py-3 font-medium text-textPrimary/90">
                          {row[0] as string}
                        </td>
                        {(row.slice(1) as [string, string][]).map(([tone, text], i) => (
                          <td
                            key={i}
                            className={`border-b border-white/10 px-4 py-3 font-semibold ${
                              tone === "yes" ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* >>> REVIEW: confirm the R8k–R15k human-receptionist benchmark (from market data). */}
              <ReviewFlag>
                Confirm you&rsquo;re happy to show the <strong>R8k–R15k</strong> human-receptionist
                benchmark (sourced from market data).
              </ReviewFlag>
            </Reveal>
          </div>
        </section>

        {/* ================= FAQ (matches JSON-LD) ================= */}
        <section className="vs-section border-t border-white/5 bg-black/40">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">Questions</p>
              <h2 className="vs-section-title">AI voice agents, answered plainly.</h2>
              <div className="mt-6">
                {[
                  { q: "What is an AI voice agent?", a: "Software that answers and makes phone calls in a natural human voice. It greets callers, answers common questions, qualifies leads, and books appointments into your calendar — 24/7, with no human on the line. Vantage Stack builds each one custom to your business, scripts, and South African accent.", open: true },
                  { q: "How much does it cost in South Africa?", a: "Market pricing typically starts around R8,000 once-off setup per agent plus usage near R100 per agent-hour, often with a monthly minimum. A human receptionist runs R8,000–R15,000/month for business hours only. We scope your pricing to your actual call volume so you pay for what drives revenue." },
                  { q: "Will it work during load-shedding?", a: "Yes. Agents run in the cloud on redundant infrastructure with backup power, so calls are answered even when your office loses power. You never miss a customer because the grid went down." },
                  { q: "Is it POPIA-compliant?", a: "Yes. Consent handling, call disclosure, and secure storage of personal information are built into every deployment." },
                  { q: "How fast does it respond to a new lead?", a: "Instantly — within seconds. That matters: leads contacted within 5 minutes are 21× more likely to qualify, and a one-minute response can lift conversions by up to 391%." },
                  { q: "Can it connect to my CRM and WhatsApp?", a: "Yes. The voice agent plugs into your CRM, WhatsApp assistant, and follow-up workflows, so a booking automatically triggers reminders and next steps. That's the whole point of buying a system instead of a gadget." },
                ].map((f) => (
                  <details
                    key={f.q}
                    open={f.open}
                    className="border-b border-white/10 py-4 [&_summary]:list-none"
                  >
                    <summary className="cursor-pointer font-heading text-base text-textPrimary/95 md:text-lg">
                      {f.q}
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-textMuted md:text-base">{f.a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================= WHO IT'S FOR ================= */}
        <section className="vs-section">
          <div className="vs-container">
            <Reveal className="max-w-3xl">
              <p className="vs-section-heading">Is this right for you?</p>
              <h2 className="vs-section-title">Who gets the most out of an AI voice agent.</h2>
              <AnswerBox>
                <strong>Short answer:</strong> If your business runs on inbound calls and booked
                appointments — and you&rsquo;re losing some of them to missed calls, slow follow-up,
                or after-hours gaps — a voice agent pays for itself fast. It&rsquo;s built for small
                South African teams under 50 people who can&rsquo;t justify a full-time reception desk
                but can&rsquo;t afford to keep dropping leads either.
              </AnswerBox>
              <p className="text-sm text-textMuted md:text-base">
                It&rsquo;s an especially strong fit if you recognise yourself here:
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="vs-card border border-white/10">
                  <h3 className="font-heading text-base text-textPrimary/95">You&rsquo;re the bottleneck</h3>
                  <p className="mt-1 text-xs leading-relaxed text-textMuted/90 md:text-sm">
                    Calls, quotes, and the actual work all run through one or two people. Every ringing
                    phone is a choice between doing the job and answering the lead.
                  </p>
                </div>
                <div className="vs-card border border-white/10">
                  <h3 className="font-heading text-base text-textPrimary/95">You spend on getting found</h3>
                  <p className="mt-1 text-xs leading-relaxed text-textMuted/90 md:text-sm">
                    You pay for Google Ads, social, or referrals to make the phone ring — so letting
                    any of those calls go unanswered is paying twice to lose the same customer.
                  </p>
                </div>
                {/* >>> REVIEW: source draft was truncated mid-sentence here (see report). */}
                <div className="vs-card border border-dashed border-amber-500/40 bg-amber-500/[0.04]">
                  <h3 className="font-heading text-base text-textPrimary/95">Your business books time</h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/70 md:text-sm">
                    [Draft truncated] — the source HTML cut off mid-sentence in this card. Awaiting the
                    complete copy from Cowork for the remainder of this section.
                  </p>
                </div>
              </div>
              <ReviewFlag>
                Cowork&rsquo;s draft export ended here mid-tag (25,366 bytes, no final CTA or footer).
                The card above and the final CTA below are stubs pending the complete file — logged
                back to Cowork as HO-2026-07-01-002.
              </ReviewFlag>
            </Reveal>
          </div>
        </section>

        {/* ================= FINAL CTA (reconstructed — draft truncated) ================= */}
        <section className="vs-section border-t border-white/5">
          <div className="vs-container">
            <Reveal className="vs-card mx-auto max-w-3xl border border-white/10 text-center">
              <p className="vs-section-heading justify-center">Your next move</p>
              <h2 className="font-heading text-2xl md:text-3xl">
                Stop letting ready-to-buy callers reach voicemail.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-textMuted">
                Book a 30-minute strategy call. We&rsquo;ll show you a live agent and work out your
                own missed-call cost, live.
              </p>
              <div className="mt-6 flex justify-center">
                <BookCallButton className="vs-button-primary text-sm" />
              </div>
              {/* >>> REVIEW: booking link (final CTA) + final-CTA copy */}
              <ReviewFlag>
                Final-CTA copy is a placeholder reconstruction (Cowork&rsquo;s draft was truncated
                before this section). Confirm wording and booking destination.
              </ReviewFlag>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
