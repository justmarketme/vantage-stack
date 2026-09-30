import type { CoachCard } from "../types";

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
 * Tone for every card (Jeremy Miner): curious, calm, slightly detached. We are not
 * trying to "win" — we are helping them find out whether a problem exists and whether
 * it matters. Questions do the selling. Square-bracket cues are tonality, not words.
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
      "Don't bluff and don't pitch. Drop your tone, slow down, and treat the receptionist as the expert — she usually knows the phone problem better than the owner.",
    ask: [
      "[easy, a bit unsure] Honestly, I'm not sure if it's even relevant to you — maybe you can help me. When the phones get busy, or after you close, what happens to the calls and WhatsApps that come in?",
      "Who normally looks at how many new enquiries the clinic gets — would that be you or the owner?",
    ],
    reframe:
      "You're not selling past her — you're asking for her help. If she describes the problem, she becomes your internal champion.",
    confirm:
      "Would it make sense for me to chat to [owner] for five minutes, or would you rather I send a note that you can pass on — which would be easier for you?",
    theory:
      "Gatekeepers are paid to filter salespeople, so confident pitching triggers their defence. Sounding slightly unsure and asking for help flips the dynamic: people are wired to help someone who asks sincerely, and a question about their own workload makes them the expert. Once she describes the problem in her words, she carries it to the owner for you.",
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
    ],
    listen:
      "Respect it instantly. Lower your voice, slow down. Rushing now proves you're a salesperson.",
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
      "'I'm busy' is usually a reflex, not a verdict. Pushing on confirms the salesperson stereotype and hardens resistance; instantly respecting it lowers their guard. A single easy question about what happens to calls when they're busy lets them notice the problem themselves, which is far more persuasive than you telling them.",
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
    ],
    listen:
      "Don't argue and don't re-pitch. Agree, go neutral, and get curious — most 'not interested' is 'not interested in being sold to'.",
    ask: [
      "[relaxed] That's totally fine — and to be honest, you might not need it. Can I ask, is that because every call and WhatsApp already gets answered, even after hours?",
      "Out of curiosity, what are you doing at the moment to handle enquiries that come in at night or on weekends?",
    ],
    reframe:
      "You're not asking them to be interested in AI — only whether any enquiries slip through. If none do, you leave happily.",
    confirm:
      "If it turned out you were losing a few bookings a week that way, would that be worth a closer look — or still not really?",
    theory:
      "Early 'not interested' is resistance to being sold, not a considered rejection of an idea they haven't heard. NEPQ removes the pressure by agreeing they might not need it, which disarms the defence. Asking whether every enquiry really gets answered invites them to check their own reality, and only self-discovered problems create genuine motivation.",
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
    ],
    listen:
      "Don't defend the price and don't rush to a number. Let the silence sit, then take the pressure off — cost only means something next to what they're losing.",
    ask: [
      "[slightly unsure] That's fair — and honestly I don't know yet if it would even be worth it for you. Roughly how many enquiries come in after hours or on weekends that nobody gets back to straight away?",
      "If one new filler or Botox client is worth, say, R2,500 on the first visit — and more over the year — what do you think those missed ones add up to in a month?",
    ],
    reframe:
      "It isn't a cost against your budget — it's measured against the bookings you're already losing. If it doesn't pay for itself from those, you shouldn't do it.",
    confirm:
      "So if it covered its own cost from bookings you're currently missing, would it be worth seeing the numbers — or not really?",
    theory:
      "Price objections appear when cost is judged against nothing. Defending the number makes you the adversary; staying detached and moving the conversation to the cost of missed bookings gives the price a reference point they calculated themselves. People believe their own maths far more than your claims, so let them do the sum out loud.",
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
    ],
    listen:
      "Agree warmly — never imply she's doing a bad job. You're looking for the gaps she can't physically cover.",
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
      "Owners hear 'AI receptionist' as 'your staff aren't good enough', which triggers loyalty and defensiveness. Affirming the receptionist first keeps them on your side. Problem-awareness questions about peak moments and after-hours gaps reveal the limits of one person without criticising anyone, reframing the product as support for her rather than a replacement.",
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
      "They're right — and say so. Aesthetics is personal and trust-based. Don't argue the premise; explore what happens when no human is available.",
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
      "This belief comes from genuine care for their clients, so arguing it signals you don't understand their business. Agreeing builds trust. Contrasting a warm instant reply with 'no reply until morning' shows the real alternative isn't a human — it's silence — and lets them conclude on their own that silence is worse for the client experience.",
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
      "Don't claim it's perfect. Get curious about what they've experienced — usually a bad IVR menu or a clunky website bot.",
    ask: [
      "[genuinely curious] That's fair — a lot of them are awful. What have you come across that put you off?",
      "If you heard one that sounded natural and actually booked the appointment properly, would that change how you feel — or would you still rather not?",
    ],
    reframe:
      "The easiest way to judge is to hear it — rather than me describe it, you can call it yourself and try to catch it out.",
    confirm:
      "Would it be worth two minutes on a demo line to hear it for yourself — then you can decide if your clients would be comfortable?",
    theory:
      "Fear of sounding robotic is fear of looking cheap in front of premium clients — a reputation risk. Asking what put them off surfaces the specific bad experience you need to beat. Offering to let them test it themselves shifts them from sceptic to evaluator, and direct experience overrides assumptions far faster than any description.",
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
    ],
    listen:
      "This is usually a polite way to end the call. Agree — then make the info worth reading by finding out what matters to them.",
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
      "'Send me info' is the most common polite exit: agreeing costs them nothing and ends the call. Rather than fight it, NEPQ agrees and then asks what the information should contain — which re-engages them in their own problem. Tying the email to a short follow-up turns a brush-off into a micro-commitment, the smallest next step they can easily say yes to.",
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
    ],
    listen:
      "Totally reasonable — don't push past it. Find out how decisions get made and help them sell it internally.",
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
      "Sometimes true, sometimes a shield. Either way the champion needs help selling internally, because people rarely repeat a pitch well. Asking what the other person will ask and how decisions get made reveals the real process and any hidden objection. Offering a joint conversation removes the burden of relaying it, which most people are relieved to hand over.",
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
      "Let them vent fully. What went wrong last time is exactly what they'll judge you on — write it down.",
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
      "A past failure creates loss aversion — nobody wants to be burned twice. Letting them tell the story fully lowers the emotion and gives you the exact criteria they'll judge you on. Reconnecting them to the original goal separates the problem (still real) from the failed tool, so the question becomes 'is it still worth solving?'",
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
      "Congratulate them — genuinely. Demand isn't their problem, so look for leakage: cancellations, no-shows, and the higher-value work they can't get to.",
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
      "'Fully booked' says demand isn't the pain, so pitching more leads misses. Genuine congratulation builds rapport, then questions move attention to leakage they rarely measure: cancellations, no-shows and people turned away. A busy clinic feels those gaps most, and a small, concrete number (two slots a week) is easy for them to value.",
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
      "Good — that's a positive. Don't compete with it. Find out how many people actually use the link versus calling or WhatsApping.",
    ask: [
      "[curious] Oh nice, that's helpful. Roughly what percentage of new clients actually book through the link, versus calling or messaging first?",
      "When someone WhatsApps with a question before booking — 'is filler sore, how much for lips' — who answers that, and how quickly?",
    ],
    reframe:
      "The booking system is the diary. The AI is the person who answers the questions and puts them in it — it works with what you already have.",
    confirm:
      "If it booked straight into [their system] so nothing changed for your team, would that be worth a look?",
    theory:
      "Owners assume a booking link equals booking automation. Questions about how many clients actually use the link — versus calling or messaging with questions first — expose the gap between a diary and a conversation. Positioning the AI as working with their system removes the fear of switching tools, one of the strongest sources of inertia.",
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
    ],
    listen:
      "This is a good sign — they're thinking about actually using it. Take it seriously and slowly; never brush it off.",
    ask: [
      "[serious, calm] That's exactly the right question to ask. What specifically would you need to be comfortable with?",
      "Who looks after POPIA at the clinic — is there an information officer I should include?",
    ],
    reframe:
      "It only handles booking conversations, not clinical records. Data is encrypted, access-controlled, and we can walk your information officer through exactly what's stored and for how long.",
    confirm:
      "If we sent your information officer the data-handling details in writing first, would that be the right next step?",
    theory:
      "Compliance questions are a buying signal: they're imagining actually using it. Treating the concern seriously and slowly signals competence, while brushing it off destroys trust instantly. Bringing in their information officer early turns a potential blocker into a stakeholder, and written detail lets them verify rather than take your word for it.",
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
      "A buying question in disguise. Answer honestly and briefly, then find out what's behind it — usually fear of being stuck with something that doesn't work.",
    ask: [
      "[straightforward] Good question — I'll give you the exact terms. Can I ask what's behind it — have you been stuck in something before?",
      "What would you need to see in the first month to know it's working?",
    ],
    reframe:
      "The real question is 'what if it doesn't work?' — so agree up front what 'working' means and how you'll both measure it.",
    confirm:
      "If we agreed the numbers we'd look at after the first month, would that make the term feel less of a risk?",
    theory:
      "Questions about terms are usually fear of being trapped with something that doesn't work. An honest, short answer builds credibility; asking what's behind it reveals whether they've been burned before. Agreeing up front what 'working' looks like replaces an abstract risk with a measurable checkpoint.",
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
      "Agree completely — they're right to be protective. This is about patient safety and their reputation.",
    ask: [
      "[agreeing] You're 100% right, and it shouldn't answer those. What kinds of clinical questions do clients usually ask before booking?",
      "At the moment, when someone asks about side effects on WhatsApp at night, what happens?",
    ],
    reframe:
      "It's set up to never give medical advice — clinical questions get a safe answer ('the doctor covers that in your consultation') and are flagged to your team. Its job is to get them into the consultation.",
    confirm:
      "If you could approve exactly what it's allowed to say, and everything clinical went to you, would that feel safe enough to try?",
    theory:
      "This is about patient safety and professional reputation — a genuinely high-stakes fear. Agreeing completely shows you share their values. Asking what happens today with late-night clinical questions shows the current risk too, and giving them control over exactly what it may say moves them from fear to ownership.",
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
      "Great — that's inbound demand. Explore what happens between 'they see a post' and 'they're in the chair'.",
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
      "Clinics that rely on Instagram and referrals believe their lead flow is solved, so they don't see a need. The gap is speed-to-reply: interest decays by the hour and prospects message several clinics at once. Asking how quickly DMs get answered — and what happens at 9pm — lets them see that the problem is conversion, not demand.",
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
    ],
    listen:
      "Don't grab the callback slot yet. Something has made now feel wrong — find out what, calmly.",
    ask: [
      "[no pressure] Sure, I can do that. Just so I understand — what's going to be different next month?",
      "In the meantime, what happens to the enquiries you miss between now and then?",
    ],
    reframe:
      "Waiting has a cost: every month without it is a month of the same missed calls. If that cost is small, waiting is right — let them decide.",
    confirm:
      "Would it make sense to have a quick look now so you can decide properly — or would you genuinely rather I call on [date]?",
    theory:
      "Deferral protects them from making a decision now. Asking what will be different next month surfaces the real reason — often nothing changes. Consequence questions about the missed enquiries in the meantime make the cost of waiting visible, while leaving the choice with them keeps it pressure-free.",
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
    ],
    listen:
      "Accept it. Then gently find out what exactly they need to think about — usually one unresolved concern.",
    ask: [
      "[relaxed] Of course, it's a decision worth thinking about. What part of it are you still unsure about?",
      "Is it more about whether it'll work for your clients, or about the cost?",
    ],
    reframe:
      "Thinking time is only useful if the open question gets answered. Name it now and you can answer it together.",
    confirm:
      "If we cleared up [that concern], would you feel comfortable going ahead — or would there still be something else?",
    theory:
      "'Let me think about it' usually hides one unresolved concern the prospect hasn't named. Agreeing removes pressure; asking which part they're unsure about isolates it. Once the concern is spoken it can be resolved together, whereas unnamed doubt almost always turns into 'no' after the call.",
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
    ],
    listen:
      "Small clinics feel missed calls the most — the practitioner is usually the one holding the needle when the phone rings.",
    ask: [
      "[curious] Makes sense. When you're mid-treatment, who answers the phone?",
      "How many calls or messages do you think you get back to only at the end of the day?",
    ],
    reframe:
      "The smaller the team, the more each missed booking hurts — it's a receptionist for the hours you're treating.",
    confirm:
      "If it just covered the time you're with clients, would that be useful — or not really?",
    theory:
      "Small practices assume automation is for big clinics. In reality the practitioner is often also the receptionist, so every call during a treatment is missed. Asking who answers mid-treatment makes that tangible, and framing it as cover for the hours they're treating right-sizes the solution.",
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
      "Slow, low, a little unsure. No pitch, no 'how are you today'. You're finding out if there's a problem — not selling.",
    ask: [
      "[slower] Hi, it's [name] from VantageStack — I'm not sure if you can help me for a moment?",
      "We work with aesthetic clinics that were losing bookings to missed calls and after-hours WhatsApps. I'm not sure if that's even something you deal with — is it, or not really?",
    ],
    reframe: "The question is whether a problem exists. If it doesn't, you both move on happily.",
    confirm: "Would it be okay if I asked you a couple of quick questions to see if it's even relevant?",
    theory:
      "The first seconds decide whether you're filed as 'salesperson'. Enthusiasm and scripted openers trigger defences; a calm, slightly unsure tone and a request for help lower them. Framing the call around whether a problem even exists gives them permission to engage without feeling sold to.",
    priority: 2,
  },
  {
    id: "stage-situation",
    kind: "stage",
    severity: "guide",
    stage: "situation",
    title: "Situation — how enquiries flow today",
    triggers: ["we get a lot of calls", "we get calls", "whatsapp", "we answer", "our phones", "the phone"],
    listen: "Get the facts of how it works now. Short questions, let them talk, take notes.",
    ask: [
      "How do new clients usually get in touch — calls, WhatsApp, Instagram DMs?",
      "Who answers those, and what happens after you close for the day?",
      "Roughly how many new enquiries come in during a normal week?",
    ],
    reframe: "You're building their picture, not yours. Numbers they say out loud stick.",
    confirm: "So if I've got it right, most come in by [channel] and [person] handles them during hours — is that fair?",
    theory:
      "Situation questions build the factual picture you'll need later, and each answer increases their investment in the conversation. Keep them short and neutral — too many feel like an interrogation. Numbers they say aloud become anchors they'll believe later.",
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
    listen: "Let them find the problem. Don't name it for them — ask, then stay quiet.",
    ask: [
      "[curious] When a call comes in after hours or while you're with a client, what usually happens to it?",
      "How often does someone WhatsApp asking about prices and then just... go quiet?",
      "And no-shows — how many would you say you get in a normal week?",
    ],
    reframe: "They're not short of interest — they're short of hands at the right moment.",
    confirm: "Has that been going on for a while, or is it something that's got worse lately?",
    theory:
      "People act on problems they discover, not ones they're told about. Open, curious questions about what happens to calls and messages let them uncover the leak in their own words. Silence after the question matters: the insight comes while they think.",
    priority: 3,
  },
  {
    id: "stage-solution-awareness",
    kind: "stage",
    severity: "guide",
    stage: "solution_awareness",
    title: "Solution awareness — their picture of 'fixed'",
    triggers: ["that would help", "that would be nice", "how does it work", "what does it do", "if we could"],
    listen: "Let them describe the ideal in their words. Their words go into your proposal.",
    ask: [
      "If every enquiry got answered within a minute — day or night — what would that change for the clinic?",
      "What would it mean for you personally not to be answering WhatsApps at 10pm?",
      "How would you like it to work, ideally?",
    ],
    reframe: "They're selling themselves the outcome. You just hold up the mirror.",
    confirm: "So what you'd really want is [their words] — have I got that right?",
    theory:
      "Having them describe their ideal outcome creates a vivid future state and the gap between that and today — the emotional engine of a decision. Their exact words become the language of your proposal, so it feels like their idea.",
    priority: 3,
  },
  {
    id: "stage-consequence",
    kind: "stage",
    severity: "guide",
    stage: "consequence",
    title: "Consequence — the cost of changing nothing",
    triggers: ["we lose clients", "they go elsewhere", "they go to another clinic", "lost bookings", "we lose them"],
    listen: "Soft and slow. This is where urgency comes from — theirs, not yours.",
    ask: [
      "[gently] What happens if this just carries on the way it is for the next six months?",
      "If you're missing even five consults a week, what do you think that adds up to over a year?",
      "Where do those clients end up going instead?",
    ],
    reframe: "The status quo isn't free — it's the most expensive option they have.",
    confirm: "Is that something you'd want to fix now, or is it okay as it is for the moment?",
    theory:
      "Urgency must be internal. Asking what happens if nothing changes makes the status quo feel costly rather than safe. Keep it gentle — pressure turns consequence into resistance — and let them put a number on it.",
    priority: 3,
  },
  {
    id: "stage-qualifying",
    kind: "stage",
    severity: "guide",
    stage: "qualifying",
    title: "Qualifying — is it important, and who decides?",
    triggers: ["sounds interesting", "interesting", "what would it cost", "how much would it be", "who else uses it"],
    listen: "Check commitment and the decision process before you present anything.",
    ask: [
      "How important is it for you to sort this out — would you say it's a priority, or a nice-to-have?",
      "Why is that important to you right now?",
      "Besides yourself, who else would be involved in deciding on something like this?",
    ],
    reframe: "If it's not important to them, no demo will fix that — find out now.",
    confirm: "So it's a priority, and [names] would decide together — is that right?",
    theory:
      "Commitment questions test whether the problem matters enough to act on and who has to agree. Asking 'why is that important to you?' makes them justify the change to themselves. Presenting before this is confirmed wastes both parties' time.",
    priority: 3,
  },
  {
    id: "stage-transition",
    kind: "stage",
    severity: "guide",
    stage: "transition",
    title: "Transition — bridge to the demo",
    triggers: ["tell me more", "how would it work for us", "what's involved", "show me", "can i see it"],
    listen: "Summarise their problem in their words before you mention anything about the product.",
    ask: [
      "Based on what you've shared — [missed after-hours calls, slow WhatsApp replies, no-shows] — I think we might be able to help. Would it be worth seeing how it would work for your clinic?",
      "Would you want to hear it answer a call the way it would for your clients?",
    ],
    reframe: "The demo is proof for their problem, not a tour of features.",
    confirm: "Does 20 minutes on [day] work, so I can show you with your own treatments and prices?",
    theory:
      "Summarising their problem in their words proves you listened and earns the right to present. The demo then becomes proof for their specific situation, not a feature tour — which keeps the conversation about them.",
    priority: 3,
  },
  {
    id: "stage-commitment",
    kind: "stage",
    severity: "guide",
    stage: "commitment",
    title: "Commitment — lock the next step",
    triggers: ["sounds good", "let's do it", "when can we start", "book a demo", "okay let's", "send me a time", "i'm keen"],
    listen: "Stop selling. Keep it simple and specific. Silence after the question is fine.",
    ask: [
      "Great — what day this week works best for a 20-minute look, with you and [decision maker]?",
      "Is the best number and email for the invite [confirm details]?",
    ],
    reframe: "A specific time and both decision makers on the call is the commitment — nothing vague.",
    confirm: "So that's [day, time] with [names]. I'll send the invite on WhatsApp and email now — anything you'd like me to prepare?",
    theory:
      "Vague next steps evaporate. A specific time with the right people is the real commitment, and making it the smallest easy step (20 minutes) keeps the ask low-friction. Stop selling once they're ready; extra talk creates new doubts.",
    priority: 4,
  },
];

export const COACH_CARDS: CoachCard[] = [...OBJECTIONS, ...STAGES];
