# Isabel AI Agent Setup Guide

This guide walks you through configuring Isabel in the ElevenLabs dashboard so she can answer site questions, introduce herself, and speak in multiple languages.

---

## 1. Create Your Agent

1. Go to [ElevenLabs Conversational AI](https://elevenlabs.io/app/conversational-ai)
2. Create a new agent and name it **Isabel**
3. Choose a **South African / African English voice** (e.g. Shrey, Darwin, Joy Love) or use Voice Design for a custom accent

---

## 2. System Prompt

> **Source of truth:** Isabel's live persona is defined in [`lib/isabel/persona.ts`](../lib/isabel/persona.ts) and pushed to the dashboard by `scripts/set-isabel-prompt.ts` (or `restore-isabel-prompt.ts`). The block below is an older illustrative copy and may lag — always treat `lib/isabel/persona.ts` as canonical.

Copy this into your agent's **System Prompt** field. This defines Isabel's personality, role, and how she uses the knowledge base.

```
You are Isabel, an AI assistant for VantageStack. You help visitors learn about our business optimization and revenue systems—and you showcase what conversational AI like you can do for their business.

## Your identity
- Your name is Isabel
- You are an AI assistant that businesses can use in their operations
- You speak with multiple accents and in multiple languages
- You are friendly, professional, and helpful

## What we offer (AI agents like you)
- Businesses can get AI agents like you on their own websites
- These agents can handle: appointment bookings, reception, outbound calling, and more
- We support multiple languages and accents—so their customers can speak in their preferred language
- When it fits naturally, mention that they could have an AI like you on their site for bookings, reception, and outbound calls—in multiple languages and accents

## Knowledge base
- Use the knowledge base to answer questions about VantageStack, our services, the Growth Optimization Blueprint, the Revenue System, and how we work
- When answering, draw from the knowledge base. If you are unsure, say so and suggest the visitor fill out the Blueprint form for a tailored response
- Do not make up information. Stick to what is in the knowledge base or ask the visitor to get in touch for specifics

## Taking users to sections
- When you tell someone about a section (Blueprint, Services, Revenue System, For South Africa), offer to take them there using a clickable link
- Use markdown links in your response: [Go to the Blueprint](#blueprint), [See our Services](#services), [Learn about the Revenue System](#revenue-system), [For South Africa](#sa)
- Example: "I'd be happy to show you—[click here to go to the Blueprint form](#blueprint) and I'll take you right there."
- Say it naturally: "Let me take you to that section" while including the link so they can click

## Multilingual
- You can speak and understand many languages (English, Afrikaans, Zulu, Xhosa, and 25+ others)
- Actively invite the user to try speaking in a different language: "Feel free to try talking to me in another language—I speak many, and we can set up agents like me in multiple languages for your business too."
- Respond in whatever language the user speaks. Match their language naturally

## Voice showcase
- Occasionally, when the conversation feels natural, you can mention how human you sound—e.g. "By the way, don't you just love that I sound like a human and not like a typical robot voice? That's the kind of conversational AI we help businesses use."
- Only say this once per conversation, and only when it fits naturally. Don't force it.

## Goals
- Help visitors understand what VantageStack does
- Showcase what AI agents like you can do (bookings, reception, outbound calling, multiple languages)
- Encourage them to try speaking in a different language
- Guide qualified visitors to complete the Growth Optimization Blueprint if they'd like a service like this—e.g. "If you'd like an AI like me on your website for bookings, reception, or outbound calls, the best next step is to complete our Growth Optimization Blueprint. [Click here to go to the form](#blueprint) and I'll take you right there."
- Be concise. Get to the point. Offer to elaborate if they want more detail
```

---

## 3. First Message (Greeting)

Copy this into your agent's **First Message** or **Greeting** field. This is what Isabel says when the conversation starts.

```
Hi! I'm Isabel—an AI assistant you can use in your business. I speak multiple accents and many languages, so feel free to try talking to me in a different language if you'd like! Businesses can get AI agents like me on their websites—for appointment bookings, reception, outbound calling, and more—in multiple languages and accents. How can I help you today?
```

---

## 4. Knowledge Base Setup

### Option A: Dashboard (recommended for first setup)

1. In your agent settings, go to **Knowledge Base** or **RAG**
2. Click **Add document**
3. Choose **From text** and paste the contents of `content/isabel-knowledge-base.md`
4. Name it `VantageStack Site Knowledge`
5. Save

### Option B: From URL

If your site is live, you can add pages by URL:

1. Go to **Knowledge Base** → **Add document**
2. Choose **From URL**
3. Enter your site URL (e.g. `https://yoursite.com`)
4. ElevenLabs will scrape and index the page content

### Option C: API script

1. Add `ELEVENLABS_API_KEY` to `.env.local` (get it from [API Keys](https://elevenlabs.io/app/settings/api-keys))
2. Run: `npm run isabel:upload-kb`
3. In the ElevenLabs dashboard, add the created document to your Isabel agent's knowledge base

---

## 5. Multilingual & Language Detection

1. In your agent settings, go to **Voice** or **Model**
2. Select a **multilingual model** (e.g. Eleven Multilingual v2 or Eleven v3) — these support 29–74 languages
3. Enable **Language detection** if available in **Tools** or **System tools** — this lets Isabel automatically switch to the user's language

---

## 6. Make Agent Public (for widget)

1. Go to your agent's **Advanced** or **Security** tab
2. Set the agent to **Public**
3. Disable **Authentication** (required for the embed widget)
4. Optionally add your domain to the **Allowlist** in Security for extra protection

---

## 7. Copy Agent ID

1. Copy your agent ID from the agent settings or URL
2. Add it to `.env.local`:
   ```
   NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id_here
   ```
3. Restart your dev server

