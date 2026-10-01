import type { CoachCard } from "../../lib/consultant/types";

/**
 * Coach Alex — the NEPQ card library for selling VantageStack AI booking agents
 * to aesthetic clinics (Botox, fillers, skin, laser) in South Africa.
 *
 * How a card works on a live call:
 *   Listen  → what to do BEFORE you speak (the behaviour, not a script).
 *   Ask     → the question(s) to say next. Shown biggest. One is enough.
 *   Reframe → the idea to land if they give you room — said as a question where possible.
 *   Confirm → a small, low-pressure check that moves the call forward.
 *
 * TWO REGISTERS — never mix them (Jono, 2026-09-30):
 *   • To the CONSULTANT (`listen`, `theory`, and the stage prompts the StageTracker
 *     shows): a high-velocity, elite direct-sales standard. Pace, own the next step,
 *     commit to a calendar date on every call, keep the pipeline moving.
 *   • To the CLINIC (`ask`, `reframe`, `confirm`): calm, curious, slightly detached
 *     NEPQ (Jeremy Miner). We are helping them find out whether a problem exists and
 *     whether it matters — questions do the selling. Pushiness kills NEPQ, so the
 *     urgency lives in the rep's agenda, never in the words said to the clinic.
 * Square-bracket cues are tonality, not words.
 *
 * Lives in /ai-configs so the NEPQ copy can be tuned without touching app code.
 * `lib/consultant/coach/cards.ts` re-exports it so existing imports keep working.
 *
 * Triggers are lower-case phrases the PROSPECT might actually say (SA English
 * included). They are word-boundary matched; the first-listed are the strongest.
 * Priority 1–10: higher wins when two cards match the same utterance.
 *
 * Severity drives how loudly a card arrives: `high_risk` (red edge, phone dims +
 * flashes) = deal-threatening objections; `stall` (brand-blue edge, phone dims) = delay
 * tactics; `guide` (no alert) = stage prompts. `theory` is the NEPQ psychology behind
 * the card — shown only behind an expand icon, never in the live glance.
 *
 * Content only — no logic. The matcher lives in `matcher.ts` (Agent 2).
 */

// ── Objections ──────────────────────────────────────────────────────────────

const OBJECTIONS: CoachCard[] = [
  {
    id: "obj-gatekeeper",
    kind: "objection",
    severity: "stall",
    stage: "connection",
    title: "Gatekeeper: “What's this regarding?”",
    triggers: [
      "what's this regarding",
      "what is this regarding",
      "what is this about",
      "what's it about",
      "what's this about",
      "who's calling",
      "who is calling",
      "what company are you from",
      "is she expecting your call",
      "is he expecting your call",
      "can i take a message",
      "are you selling something",
      "she's with a patient",
      "he's with a patient",
      "doctor is consulting",
    ],
    listen:
      "Two seconds to reset: drop your tone, slow down, no pitch. Your job on this call is the owner's name and a time to reach them — leave without both and the lead hasn't moved.",
    ask: [
      "[easy, a bit unsure] Honestly, I'm not sure if it's even relevant to you — maybe you can help me. When the phones get busy, or after you close, what happens to the calls and WhatsApps that come in?",
      "Who normally looks at how many new enquiries the clinic gets — would that be you or the owner?",
    ],
    reframe:
      "You're not selling past her — you're asking for her help. If she describes the problem, she becomes your internal champion.",
    confirm:
      "Would it make sense for me to chat to [owner] for five minutes, or would you rather I send a note that you can pass on — which would be easier for you?",
    theory:
      "Gatekeepers are paid to filter salespeople, so confident pitching triggers their defence, while a sincere request for help makes them the expert. Once she describes the phone problem in her own words, she carries it to the owner for you. The standard: treat the gatekeeper as your first booked step — owner's name, best time, and a callback in the diary before you hang up.",
    priority: 10,
  },
  {
    id: "obj-busy",
    kind: "objection",
    severity: "stall",
    stage: "connection",
    title: "Not a good time / busy",
    triggers: [
      "not a good time",
      "now's not a good time",
      "bad time",
      "i'm with a client",
      "i'm with a patient",
      "i'm busy",
      "we're busy",
      "we're very busy",
      "eish i'm busy",
      "eish we're swamped",
      "i'm swamped",
      "in between clients",
      "can't talk now",
      "i can't talk",
      "call me back now now",
      "i don't have time",
      "i'm in a consult",
      "we're flat out",
    ],
    listen:
      "Respect it instantly and keep it tight — one question, then lock a callback slot. A 'call me later' with no date is a dead lead; a date in the diary is pipeline.",
    ask: [
      "[calm] Of course — sounds like it's a busy day at the clinic. Can I ask one quick thing so I don't waste your time later?",
      "When it's this busy, what happens to the phone calls you can't get to?",
      "What's a better time — later today, or tomorrow morning before your first client?",
    ],
    reframe:
      "The fact they're too busy to answer the phone IS the problem we solve — let them notice that themselves.",
    confirm:
      "Shall I call you back at [time]? I'll keep it to five minutes, and if it's not relevant you can tell me straight.",
    theory:
      "'I'm busy' is usually a reflex, not a verdict: pushing on hardens resistance, while respecting it instantly lowers their guard. One easy question about what happens to calls when they're busy lets them notice the problem themselves. The standard: you never end this call without a specific day and time booked for the callback.",
    priority: 9,
  },
  {
    id: "obj-not-interested",
    kind: "objection",
    severity: "high_risk",
    stage: "connection",
    title: "“Not interested”",
    triggers: [
      "not interested",
      "we're not interested",
      "i'm not interested",
      "no thank you",
      "no thanks",
      "we're fine thanks",
      "we're happy with what we have",
      "we don't need it",
      "we don't need that",
      "don't need anything",
      "we're sorted thanks",
      "no we're good",
    ],
    listen:
      "Don't argue, don't re-pitch — and don't fold. Go neutral, get curious, make one clean attempt to find the gap. No gap? Disqualify fast and dial the next clinic.",
    ask: [
      "[relaxed] That's totally fine — and to be honest, you might not need it. Can I ask, is that because every call and WhatsApp already gets answered, even after hours?",
      "Out of curiosity, what are you doing at the moment to handle enquiries that come in at night or on weekends?",
    ],
    reframe:
      "You're not asking them to be interested in AI — only whether any enquiries slip through. If none do, you leave happily.",
    confirm:
      "If it turned out you were losing a few bookings a week that way, would that be worth a closer look — or still not really?",
    theory:
      "Early 'not interested' is resistance to being sold, not a considered rejection of an idea they haven't heard. Agreeing they might not need it disarms the defence, and asking whether every enquiry really gets answered lets them check their own reality. Top performers protect their pace: one honest probe, then either a next step on the calendar or a clean disqualify.",
    priority: 9,
  },
  {
    id: "obj-price",
    kind: "objection",
    severity: "high_risk",
    stage: "qualifying",
    title: "Too expensive / “What does it cost?”",
    triggers: [
      "too expensive",
      "that's expensive",
      "that's a lot of money",
      "eish that's expensive",
      "eish that's a lot",
      "can't afford",
      "we can't afford",
      "out of our budget",
      "don't have the budget",
      "no budget",
      "sounds pricey",
      "how much does it cost",
      "what does it cost",
      "what's the price",
      "how much is it",
      "cost",
      "that's steep",
      "jislaaik that's a lot",
      "money's tight",
    ],
    listen:
      "Hold your nerve. Don't defend the price, don't discount, don't rush to a number — let the silence work. Your target: they calculate their own missed-booking cost before this call ends.",
    ask: [
      "[slightly unsure] That's fair — and honestly I don't know yet if it would even be worth it for you. Roughly how many enquiries come in after hours or on weekends that nobody gets back to straight away?",
      "If one new filler or Botox client is worth, say, R2,500 on the first visit — and more over the year — what do you think those missed ones add up to in a month?",
    ],
    reframe:
      "It isn't a cost against your budget — it's measured against the bookings you're already losing. If it doesn't pay for itself from those, you shouldn't do it.",
    confirm:
      "So if it covered its own cost from bookings you're currently missing, would it be worth seeing the numbers — or not really?",
    theory:
      "Price objections appear when cost is judged against nothing, and defending the number makes you the adversary. Moving to the cost of missed bookings gives the price a reference point they calculated themselves, and people believe their own maths. Elite closers never negotiate on the first objection — they get the value spoken aloud, then book the demo that proves it.",
    priority: 9,
  },
  {
    id: "obj-have-receptionist",
    kind: "objection",
    severity: "high_risk",
    stage: "problem_awareness",
    title: "“We have a receptionist”",
    triggers: [
      "we have a receptionist",
      "we've got a receptionist",
      "our receptionist handles",
      "my receptionist does that",
      "reception handles that",
      "the front desk handles",
      "front desk",
      "the girls at reception",
      "our girls answer the phone",
      "we have staff for that",
      "we have someone for that",
      "our receptionist sorts that out",
    ],
    listen:
      "Agree warmly — never imply she's doing a bad job. Hunt the gaps she physically can't cover, get a number on them, then move straight to booking the demo.",
    ask: [
      "[curious] Oh great, that helps a lot. When she's checking someone in or taking a payment, what happens if the phone rings and a WhatsApp comes in at the same time?",
      "And after she goes home — say 7pm on a Tuesday, or Sunday night — who picks those up?",
      "Has anyone ever counted how many calls ring out on a busy Saturday?",
    ],
    reframe:
      "It doesn't replace her. It catches what she can't reach and books it into her diary — so she can focus on the clients standing in front of her.",
    confirm:
      "Would it be useful if she started each morning with the overnight enquiries already booked — or would that not change much?",
    theory:
      "Owners hear 'AI receptionist' as 'your staff aren't good enough', which triggers loyalty and defensiveness, so affirming her first keeps them on your side. Questions about peak moments and after-hours gaps reveal the limits of one person without criticising anyone. Once the gap is quantified, don't linger — convert it into a demo date while the picture is vivid.",
    priority: 8,
  },
  {
    id: "obj-want-human",
    kind: "objection",
    severity: "high_risk",
    stage: "solution_awareness",
    title: "“Our clients want a human”",
    triggers: [
      "our clients want a human",
      "clients want a human",
      "want to speak to a real person",
      "want to talk to a real person",
      "want to speak to a person",
      "prefer a human",
      "personal touch",
      "it's a very personal business",
      "people want to talk to someone",
      "our clients like the personal",
      "they like to speak to us",
    ],
    listen:
      "They're right — say so, then move. Don't debate the premise; expose the real alternative (silence at 10pm) and steer to a demo where they hear it for themselves.",
    ask: [
      "[agreeing] You're right, it's a really personal decision. Can I ask — when a client messages at 10pm and no human is there, what does she get at the moment?",
      "Do you think she'd prefer a friendly, instant reply that books her consultation — or waiting until the next morning?",
      "What happens to the ones who don't wait?",
    ],
    reframe:
      "The human part stays with you — the consultation, the treatment, the relationship. The AI just makes sure she gets to that human instead of going to the clinic down the road.",
    confirm:
      "If it handed anything sensitive straight to your team, and only booked the straightforward stuff, would that feel okay for your clients?",
    theory:
      "This belief comes from genuine care for their clients, so arguing it signals you don't understand their business. Contrasting a warm instant reply with 'no reply until morning' shows the real alternative isn't a human — it's silence. Win this with a demo, not a debate: the fastest way through is a date on the calendar.",
    priority: 7,
  },
  {
    id: "obj-robotic",
    kind: "objection",
    severity: "high_risk",
    stage: "solution_awareness",
    title: "“AI sounds robotic”",
    triggers: [
      "sounds robotic",
      "sounds like a robot",
      "robotic",
      "sounds fake",
      "people can tell it's ai",
      "people can tell it's a bot",
      "i hate those bots",
      "i hate chatbots",
      "sounds like a machine",
      "those automated things",
      "automated messages",
      "chatbot",
    ],
    listen:
      "Don't claim perfection. Find out what burned them, then close on hearing it live — the demo line is your strongest asset, so book it on this call.",
    ask: [
      "[genuinely curious] That's fair — a lot of them are awful. What have you come across that put you off?",
      "If you heard one that sounded natural and actually booked the appointment properly, would that change how you feel — or would you still rather not?",
    ],
    reframe:
      "The easiest way to judge is to hear it — rather than me describe it, you can call it yourself and try to catch it out.",
    confirm:
      "Would it be worth two minutes on a demo line to hear it for yourself — then you can decide if your clients would be comfortable?",
    theory:
      "Fear of sounding robotic is fear of looking cheap in front of premium clients. Asking what put them off surfaces the specific bad experience you need to beat, and letting them test it shifts them from sceptic to evaluator. Direct experience beats any description, so a demo booked today is worth more than ten minutes of explaining.",
    priority: 7,
  },
  {
    id: "obj-send-info",
    kind: "objection",
    severity: "stall",
    stage: "transition",
    title: "“Send me some info / email me”",
    triggers: [
      "send me some info",
      "send me some information",
      "send me information",
      "just send me an email",
      "send me an email",
      "email me",
      "send it to my email",
      "whatsapp me the details",
      "whatsapp me",
      "send me a brochure",
      "send me something",
      "put it in an email",
      "send me a proposal",
      "send it on whatsapp",
      "drop me a whatsapp",
    ],
    listen:
      "A polite exit — don't let the deal die in an inbox. Agree, find out what matters, and attach a dated follow-up to that email before you hang up.",
    ask: [
      "[happy to] Sure, I can do that. So I don't send you a generic brochure — what would you want to see in it?",
      "Is it more the after-hours calls, the WhatsApp enquiries, or the no-shows that you'd want to know about?",
      "Once you've had a look, what would you need to see to know whether it's worth a proper chat or not?",
    ],
    reframe:
      "Information only helps if it answers their question. A 15-minute look at their own numbers beats a PDF.",
    confirm:
      "I'll send it to [email] now. Shall we pencil in ten minutes on [day] to go through whatever questions come up — and if it's not relevant, you can cancel?",
    theory:
      "'Send me info' is the most common polite exit, because agreeing costs them nothing and ends the call. Asking what the information should contain re-engages them in their own problem. Tie every email to a specific follow-up date — an email without a calendar slot is where pipeline goes to die.",
    priority: 8,
  },
  {
    id: "obj-decision-maker",
    kind: "objection",
    severity: "stall",
    stage: "qualifying",
    title: "Need to speak to partner / doctor / owner",
    triggers: [
      "speak to my partner",
      "talk to my partner",
      "discuss it with my partner",
      "check with the doctor",
      "ask the doctor",
      "the doctor decides",
      "speak to the owner",
      "the owner decides",
      "i'm not the decision maker",
      "not my decision",
      "run it past",
      "discuss it with my husband",
      "discuss it with my wife",
      "need to check with",
      "my business partner",
      "i'll chat to the doctor",
      "chat to my partner",
    ],
    listen:
      "Reasonable — don't push past it, but don't accept a vague 'I'll chat to them'. Map how the decision gets made and book a joint call with every decision maker, with a date.",
    ask: [
      "[understanding] Of course, that makes sense. When you chat to them, what do you think their first question will be?",
      "How do decisions like this normally get made at the clinic — is it the two of you together?",
      "What would they need to see to feel it's worth doing — or not?",
    ],
    reframe:
      "You're giving them the words to explain the problem, not just the product. The cost of missed bookings is the thing the owner will care about.",
    confirm:
      "Would it be easier if we found 15 minutes when the three of us can chat, so you don't have to relay everything?",
    theory:
      "Sometimes true, sometimes a shield; either way the champion needs help, because people rarely repeat a pitch well. Asking what the other person will ask reveals the real process and any hidden objection. Pipeline only moves when every decision maker is in the room, so leave with names and a joint meeting in the diary.",
    priority: 8,
  },
  {
    id: "obj-tried-before",
    kind: "objection",
    severity: "high_risk",
    stage: "problem_awareness",
    title: "“We tried something like this”",
    triggers: [
      "we tried something like this",
      "we tried something like that",
      "we've tried that before",
      "tried that before",
      "we've tried",
      "we had a chatbot",
      "we used a call centre",
      "didn't work for us",
      "it didn't work",
      "we got burnt",
      "got burned",
      "waste of money last time",
      "ag shame we tried",
    ],
    listen:
      "Let them vent fully and write down every failure point — that's the exact scorecard you'll be judged on. Then turn it into a demo that proves you beat it.",
    ask: [
      "[concerned] Ah, that's frustrating. What happened with it?",
      "What did you hope it would do for the clinic when you started?",
      "If that had actually worked the way you wanted, what would it have meant for bookings?",
    ],
    reframe:
      "The original goal was right — the tool didn't deliver. The question is whether the goal is still worth solving.",
    confirm:
      "If we could show you it handles the exact thing that went wrong last time, would you be open to having a look — or is it a hard no?",
    theory:
      "A past failure creates loss aversion — nobody wants to be burned twice. Letting them tell the story lowers the emotion and gives you their criteria, while reconnecting them to the original goal separates a still-real problem from the failed tool. Close on a dated demo built around their scorecard; proof beats promises.",
    priority: 7,
  },
  {
    id: "obj-fully-booked",
    kind: "objection",
    severity: "high_risk",
    stage: "problem_awareness",
    title: "“We're fully booked”",
    triggers: [
      "we're fully booked",
      "fully booked",
      "booked out",
      "we're booked up",
      "we're full",
      "no gaps",
      "we have a waiting list",
      "waiting list",
      "we have enough clients",
      "we don't need more clients",
      "we're too busy already",
    ],
    listen:
      "Congratulate them, then pivot fast to leakage: cancellations, no-shows, the higher-value work they can't reach. Get one concrete number and book the next step.",
    ask: [
      "[impressed] That's great — sounds like demand isn't the issue at all. How far out are you booked at the moment?",
      "When someone cancels last minute or doesn't show, how do you fill that slot?",
      "And the people who can't get in — do they wait, or go somewhere else?",
    ],
    reframe:
      "Fully booked clinics use it to fill cancellations from a waitlist instantly, cut no-shows with reminders, and move people toward the higher-value treatments.",
    confirm:
      "If it could fill even two cancelled slots a week automatically, would that be worth knowing about?",
    theory:
      "'Fully booked' says demand isn't the pain, so pitching more leads misses. Questions about cancellations, no-shows and people turned away move attention to leakage they rarely measure. A busy clinic values its time, so offer a short, specific slot and lock it in before they're pulled back to a client.",
    priority: 7,
  },
  {
    id: "obj-booking-software",
    kind: "objection",
    severity: "high_risk",
    stage: "situation",
    title: "“We already use booking software”",
    triggers: [
      "we have online booking",
      "they can book online",
      "clients book online",
      "booking system",
      "booking software",
      "booking app",
      "booking link",
      "we use fresha",
      "we use timely",
      "we use phorest",
      "we use booksy",
      "we use goodx",
      "our system already does",
    ],
    listen:
      "Good news — don't compete with it. Find the gap between the booking link and real conversations, then book a demo that shows it working alongside their system.",
    ask: [
      "[curious] Oh nice, that's helpful. Roughly what percentage of new clients actually book through the link, versus calling or messaging first?",
      "When someone WhatsApps with a question before booking — 'is filler sore, how much for lips' — who answers that, and how quickly?",
    ],
    reframe:
      "The booking system is the diary. The AI is the person who answers the questions and puts them in it — it works with what you already have.",
    confirm:
      "If it booked straight into [their system] so nothing changed for your team, would that be worth a look?",
    theory:
      "Owners assume a booking link equals booking automation. Asking how many clients actually use the link — versus calling or messaging first — exposes the gap between a diary and a conversation, and positioning the AI as working with their system removes the fear of switching. Keep momentum: name their system in the demo invite you send before the call ends.",
    priority: 6,
  },
  {
    id: "obj-popia",
    kind: "objection",
    severity: "high_risk",
    stage: "qualifying",
    title: "POPIA / patient data worries",
    triggers: [
      "popia",
      "patient data",
      "patient confidentiality",
      "patient information",
      "medical records",
      "data protection",
      "privacy",
      "where is the data stored",
      "is it secure",
      "confidential information",
      "information officer",
      "hpcsa",
      "popi act",
    ],
    listen:
      "Buying signal — they're imagining using it. Slow down, take it seriously, and turn the concern into a concrete next step: the information officer on a dated call.",
    ask: [
      "[serious, calm] That's exactly the right question to ask. What specifically would you need to be comfortable with?",
      "Who looks after POPIA at the clinic — is there an information officer I should include?",
    ],
    reframe:
      "It only handles booking conversations, not clinical records. Data is encrypted, access-controlled, and we can walk your information officer through exactly what's stored and for how long.",
    confirm:
      "If we sent your information officer the data-handling details in writing first, would that be the right next step?",
    theory:
      "Compliance questions are a buying signal: they're imagining actually using it. Treating the concern seriously signals competence, while brushing it off destroys trust instantly. Bring the information officer in early with a scheduled session, so a potential blocker becomes a stakeholder instead of a stall.",
    priority: 8,
  },
  {
    id: "obj-contract",
    kind: "objection",
    severity: "stall",
    stage: "commitment",
    title: "“How long is the contract?”",
    triggers: [
      "how long is the contract",
      "is there a contract",
      "locked in",
      "lock-in",
      "am i tied in",
      "minimum term",
      "notice period",
      "cancel anytime",
      "month to month",
      "twelve months",
      "12 months",
      "contract",
    ],
    listen:
      "A buying question in disguise — you're close. Answer honestly and briefly, find the fear behind it, then move to agreeing a start date.",
    ask: [
      "[straightforward] Good question — I'll give you the exact terms. Can I ask what's behind it — have you been stuck in something before?",
      "What would you need to see in the first month to know it's working?",
    ],
    reframe:
      "The real question is 'what if it doesn't work?' — so agree up front what 'working' means and how you'll both measure it.",
    confirm:
      "If we agreed the numbers we'd look at after the first month, would that make the term feel less of a risk?",
    theory:
      "Questions about terms are usually fear of being trapped with something that doesn't work. An honest, short answer builds credibility, and agreeing up front what 'working' looks like replaces an abstract risk with a measurable checkpoint. You're in commitment territory now: define success, then ask for the start date.",
    priority: 6,
  },
  {
    id: "obj-medical-questions",
    kind: "objection",
    severity: "high_risk",
    stage: "solution_awareness",
    title: "“I don't trust AI with medical questions”",
    triggers: [
      "medical questions",
      "medical advice",
      "clinical questions",
      "give the wrong advice",
      "what if it says the wrong thing",
      "only the doctor can answer",
      "contraindications",
      "side effects",
      "what if she's pregnant",
      "allergic",
      "liability",
    ],
    listen:
      "Agree completely — patient safety is their reputation. Show them the controls, then book the session where they approve exactly what it's allowed to say.",
    ask: [
      "[agreeing] You're 100% right, and it shouldn't answer those. What kinds of clinical questions do clients usually ask before booking?",
      "At the moment, when someone asks about side effects on WhatsApp at night, what happens?",
    ],
    reframe:
      "It's set up to never give medical advice — clinical questions get a safe answer ('the doctor covers that in your consultation') and are flagged to your team. Its job is to get them into the consultation.",
    confirm:
      "If you could approve exactly what it's allowed to say, and everything clinical went to you, would that feel safe enough to try?",
    theory:
      "This is about patient safety and professional reputation — a genuinely high-stakes fear, so agreeing completely shows you share their values. Asking what happens today with late-night clinical questions shows the current risk too, and giving them control moves them from fear to ownership. The next step is concrete: a dated session to review and sign off the script.",
    priority: 8,
  },
  {
    id: "obj-instagram-referrals",
    kind: "objection",
    severity: "high_risk",
    stage: "situation",
    title: "“Most clients come from Instagram / referrals”",
    triggers: [
      "most of our clients are referrals",
      "word of mouth",
      "referrals",
      "from instagram",
      "our instagram",
      "instagram",
      "they dm us",
      "through the dms",
      "social media",
      "tiktok",
      "facebook",
    ],
    listen:
      "That's inbound demand — great. Drill into speed-to-reply between the DM and the chair, get a number, and close on a demo date.",
    ask: [
      "[interested] Nice, that's the best kind of client. When someone DMs or WhatsApps after seeing a post, how quickly do they usually hear back?",
      "What happens to the ones who message at 9pm and don't get a reply until tomorrow?",
      "When a referral calls and nobody picks up, do you think they try again — or call the next clinic?",
    ],
    reframe:
      "Instagram and referrals create the interest; a fast reply is what converts it. Every hour's delay is when they shop around.",
    confirm:
      "If every DM and WhatsApp got a reply in under a minute — day or night — do you think more of them would end up booking?",
    theory:
      "Clinics that rely on Instagram and referrals believe their lead flow is solved. The gap is speed-to-reply: interest decays by the hour and prospects message several clinics at once, so asking what happens at 9pm shows the problem is conversion, not demand. Speed wins their deals and yours — match it by booking the next step now.",
    priority: 6,
  },
  {
    id: "obj-call-later",
    kind: "objection",
    severity: "stall",
    stage: "consequence",
    title: "“Call me next month”",
    triggers: [
      "call me next month",
      "try me next month",
      "next month",
      "after the holidays",
      "in the new year",
      "after december",
      "maybe later in the year",
      "call me just now",
      "phone me just now",
      "try me just now",
      "not right now",
      "maybe later",
      "after month end",
      "call me next week",
    ],
    listen:
      "Don't accept an undated 'later'. Calmly find out what changes next month — if nothing, work it now. If it genuinely has to wait, put a specific date in the diary.",
    ask: [
      "[no pressure] Sure, I can do that. Just so I understand — what's going to be different next month?",
      "In the meantime, what happens to the enquiries you miss between now and then?",
    ],
    reframe:
      "Waiting has a cost: every month without it is a month of the same missed calls. If that cost is small, waiting is right — let them decide.",
    confirm:
      "Would it make sense to have a quick look now so you can decide properly — or would you genuinely rather I call on [date]?",
    theory:
      "Deferral protects them from deciding now, and asking what will be different next month usually reveals that nothing changes. Consequence questions about the enquiries they'll miss in the meantime make the cost of waiting visible. 'Next month' without a calendar invite is a lost deal — a booked date keeps it in your pipeline.",
    priority: 7,
  },
  {
    id: "obj-think-about-it",
    kind: "objection",
    severity: "stall",
    stage: "commitment",
    title: "“I need to think about it”",
    triggers: [
      "i need to think about it",
      "let me think about it",
      "think about it",
      "sleep on it",
      "mull it over",
      "i'll get back to you",
      "we'll see",
      "let me see",
      "give me some time",
      "i'll come back to you",
    ],
    listen:
      "Accept it, then isolate the one open concern — never leave it unnamed. Resolve it now, or book a dated follow-up to resolve it together.",
    ask: [
      "[relaxed] Of course, it's a decision worth thinking about. What part of it are you still unsure about?",
      "Is it more about whether it'll work for your clients, or about the cost?",
    ],
    reframe:
      "Thinking time is only useful if the open question gets answered. Name it now and you can answer it together.",
    confirm:
      "If we cleared up [that concern], would you feel comfortable going ahead — or would there still be something else?",
    theory:
      "'Let me think about it' usually hides one unresolved concern, and unnamed doubt almost always turns into 'no' after the call. Agreeing removes pressure; asking which part they're unsure about isolates it so you can answer it together. Never leave on 'think about it' — leave on a date.",
    priority: 7,
  },
  {
    id: "obj-too-small",
    kind: "objection",
    severity: "high_risk",
    stage: "situation",
    title: "“We're too small for this”",
    triggers: [
      "we're too small",
      "we're a small clinic",
      "small practice",
      "it's just me",
      "only two of us",
      "one-man show",
      "one-woman show",
      "we're only small",
      "we're just a small practice",
    ],
    listen:
      "Small clinics feel missed calls the most. Make it tangible — who answers mid-treatment? — then right-size the offer and book the demo.",
    ask: [
      "[curious] Makes sense. When you're mid-treatment, who answers the phone?",
      "How many calls or messages do you think you get back to only at the end of the day?",
    ],
    reframe:
      "The smaller the team, the more each missed booking hurts — it's a receptionist for the hours you're treating.",
    confirm:
      "If it just covered the time you're with clients, would that be useful — or not really?",
    theory:
      "Small practices assume automation is for big clinics, yet the practitioner is often also the receptionist, so every call during a treatment is missed. Asking who answers mid-treatment makes that tangible and right-sizes the solution. Small clinics decide fast — one owner, one call — so push for a demo slot this week.",
    priority: 6,
  },
];

// ── Stage cards (one per NEPQ stage) ────────────────────────────────────────
// Shown when no objection is active: the go-to question for where the call is now.

const STAGES: CoachCard[] = [
  {
    id: "stage-connection",
    kind: "stage",
    severity: "guide",
    stage: "connection",
    title: "Connection — earn thirty seconds",
    triggers: ["hello", "good morning", "good afternoon", "speaking", "how can i help", "who is this"],
    listen:
      "Calm voice, sharp agenda. Slow, low, a little unsure — no pitch. Say where you found their details in the first breath (POPIA), earn thirty seconds, then find out fast whether there's a problem worth your time.",
    ask: [
      "[slower] Hi, it's [name] from VantageStack — I came across the clinic on Google while looking at aesthetic practices in [city]. I'm not sure if you can help me for a moment?",
      "We work with aesthetic clinics that were losing bookings to missed calls and after-hours WhatsApps. I'm not sure if that's even something you deal with — is it, or not really?",
    ],
    reframe: "The question is whether a problem exists. If it doesn't, you both move on happily.",
    confirm: "Would it be okay if I asked you a couple of quick questions to see if it's even relevant?",
    theory:
      "The first seconds decide whether you're filed as 'salesperson', and enthusiasm or scripted openers trigger defences. A calm, slightly unsure tone and a request for help lower them, giving permission to engage without feeling sold to. Your voice is relaxed but your clock is running: you're here to learn quickly whether this is a deal worth moving.",
    priority: 2,
  },
  {
    id: "stage-situation",
    kind: "stage",
    severity: "guide",
    stage: "situation",
    title: "Situation — how enquiries flow today",
    triggers: ["we get a lot of calls", "we get calls", "whatsapp", "we answer", "our phones", "the phone"],
    listen:
      "Facts fast. Short questions, let them talk, capture the numbers — enquiry volume and who answers. Get what you need and move on; don't camp here.",
    ask: [
      "How do new clients usually get in touch — calls, WhatsApp, Instagram DMs?",
      "Who answers those, and what happens after you close for the day?",
      "Roughly how many new enquiries come in during a normal week?",
    ],
    reframe: "You're building their picture, not yours. Numbers they say out loud stick.",
    confirm: "So if I've got it right, most come in by [channel] and [person] handles them during hours — is that fair?",
    theory:
      "Situation questions build the factual picture you'll need later, and each answer increases their investment in the conversation. Keep them short and neutral — too many feel like an interrogation — and numbers they say aloud become anchors they'll believe later. Top reps are in and out of situation in a few questions; deals are made in problem and consequence.",
    priority: 2,
  },
  {
    id: "stage-problem-awareness",
    kind: "stage",
    severity: "guide",
    stage: "problem_awareness",
    title: "Problem awareness — where bookings leak",
    triggers: [
      "we miss calls",
      "missed calls",
      "can't always answer",
      "can't get to the phone",
      "after hours",
      "no-shows",
      "no shows",
      "people don't show up",
      "we reply in the morning",
    ],
    listen:
      "This is where deals are won. Ask, then stay quiet — let them find the leak. Don't advance until the problem is said out loud in their words.",
    ask: [
      "[curious] When a call comes in after hours or while you're with a client, what usually happens to it?",
      "How often does someone WhatsApp asking about prices and then just... go quiet?",
      "And no-shows — how many would you say you get in a normal week?",
    ],
    reframe: "They're not short of interest — they're short of hands at the right moment.",
    confirm: "Has that been going on for a while, or is it something that's got worse lately?",
    theory:
      "People act on problems they discover, not ones they're told about. Open, curious questions let them uncover the leak in their own words, and the insight comes during the silence after the question. A named problem is the only thing that moves a lead forward, so earn it before you go on.",
    priority: 3,
  },
  {
    id: "stage-solution-awareness",
    kind: "stage",
    severity: "guide",
    stage: "solution_awareness",
    title: "Solution awareness — their picture of 'fixed'",
    triggers: ["that would help", "that would be nice", "how does it work", "what does it do", "if we could"],
    listen:
      "Let them describe 'fixed' in their own words — capture them verbatim. Those words are your proposal and your close.",
    ask: [
      "If every enquiry got answered within a minute — day or night — what would that change for the clinic?",
      "What would it mean for you personally not to be answering WhatsApps at 10pm?",
      "How would you like it to work, ideally?",
    ],
    reframe: "They're selling themselves the outcome. You just hold up the mirror.",
    confirm: "So what you'd really want is [their words] — have I got that right?",
    theory:
      "Having them describe their ideal outcome creates a vivid future state and the gap between that and today — the emotional engine of a decision. Their exact words become the language of your proposal, so it feels like their idea. Note them now; they're what you'll read back when you ask for the booking.",
    priority: 3,
  },
  {
    id: "stage-consequence",
    kind: "stage",
    severity: "guide",
    stage: "consequence",
    title: "Consequence — the cost of changing nothing",
    triggers: ["we lose clients", "they go elsewhere", "they go to another clinic", "lost bookings", "we lose them"],
    listen:
      "Urgency comes from them, not you — your voice goes soft while your agenda stays sharp. Don't leave this stage without the cost of doing nothing in a number.",
    ask: [
      "[gently] What happens if this just carries on the way it is for the next six months?",
      "If you're missing even five consults a week, what do you think that adds up to over a year?",
      "Where do those clients end up going instead?",
    ],
    reframe: "The status quo isn't free — it's the most expensive option they have.",
    confirm: "Is that something you'd want to fix now, or is it okay as it is for the moment?",
    theory:
      "Urgency must be internal. Asking what happens if nothing changes makes the status quo feel costly rather than safe, and letting them put a number on it makes it real. Keep the tone gentle, because pressure turns consequence into resistance, but always land the number.",
    priority: 3,
  },
  {
    id: "stage-qualifying",
    kind: "stage",
    severity: "guide",
    stage: "qualifying",
    title: "Qualifying — is it important, and who decides?",
    triggers: ["sounds interesting", "interesting", "what would it cost", "how much would it be", "who else uses it"],
    listen:
      "Qualify hard before you present anything: is it a priority, and who decides? A deal without the decision maker isn't pipeline — it's hope.",
    ask: [
      "How important is it for you to sort this out — would you say it's a priority, or a nice-to-have?",
      "Why is that important to you right now?",
      "Besides yourself, who else would be involved in deciding on something like this?",
    ],
    reframe: "If it's not important to them, no demo will fix that — find out now.",
    confirm: "So it's a priority, and [names] would decide together — is that right?",
    theory:
      "Commitment questions test whether the problem matters enough to act on and who has to agree. Asking 'why is that important to you?' makes them justify the change to themselves. Elite reps would rather disqualify today than chase a maybe for a month.",
    priority: 3,
  },
  {
    id: "stage-transition",
    kind: "stage",
    severity: "guide",
    stage: "transition",
    title: "Transition — bridge to the demo",
    triggers: ["tell me more", "how would it work for us", "what's involved", "show me", "can i see it"],
    listen:
      "Summarise their problem in their words, then go straight for the demo slot — a specific day and time, never 'sometime next week'.",
    ask: [
      "Based on what you've shared — [missed after-hours calls, slow WhatsApp replies, no-shows] — I think we might be able to help. Would it be worth seeing how it would work for your clinic?",
      "Would you want to hear it answer a call the way it would for your clients?",
    ],
    reframe: "The demo is proof for their problem, not a tour of features.",
    confirm: "Does 20 minutes on [day] work, so I can show you with your own treatments and prices?",
    theory:
      "Summarising their problem in their words proves you listened and earns the right to present. The demo then becomes proof for their specific situation, not a feature tour. A transition only counts when it ends in a calendar invite with a date on it.",
    priority: 3,
  },
  {
    id: "stage-commitment",
    kind: "stage",
    severity: "guide",
    stage: "commitment",
    title: "Commitment — lock the next step",
    triggers: ["sounds good", "let's do it", "when can we start", "book a demo", "okay let's", "send me a time", "i'm keen"],
    listen:
      "Stop selling. Own the next step: a specific date, a specific time, every decision maker on the invite. No call ends without it.",
    ask: [
      "Great — what day this week works best for a 20-minute look, with you and [decision maker]?",
      "Is the best number and email for the invite [confirm details]?",
    ],
    reframe: "A specific time and both decision makers on the call is the commitment — nothing vague.",
    confirm: "So that's [day, time] with [names]. I'll send the invite on WhatsApp and email now — anything you'd like me to prepare?",
    theory:
      "Vague next steps evaporate, and a specific time with the right people is the real commitment. Making it the smallest easy step (20 minutes) keeps the ask low-friction, and extra talk after a yes only creates new doubts. Send the invite before you hang up.",
    priority: 4,
  },
];

export const COACH_CARDS: CoachCard[] = [...OBJECTIONS, ...STAGES];
