import type { AggregatedClientContext } from "./types";

export function buildMasterPrompt(designBriefMarkdown: string, ctx: AggregatedClientContext): string {
  const d = ctx.discovery;
  const pages =
    d.pages_needed?.length && d.pages_needed.length > 0
      ? d.pages_needed.join(", ")
      : "Home, About, Services, Contact, (optional Blog, FAQ, Pricing)";

  return `You are a world-class fullstack web developer and UI/UX designer. Your task is to build a production-ready Next.js website that solves ${ctx.company || ctx.clientName}'s business problems.

## BUSINESS CONTEXT

- **Client:** ${ctx.company || ctx.clientName}
- **Industry:** ${ctx.industry}
- **Stage:** ${ctx.companyStage}
- **Main goal:** ${ctx.successGoals || "Grow qualified leads and trust"}
- **Target customer:** ${d.feature_priorities || `Buyers in ${ctx.industry}`}
- **Competitor analysis:** Competitors listed in CRM: ${ctx.competitors.join(", ") || "—"}; differentiate on clarity, performance, and proof.

## DESIGN REQUIREMENTS

- **Brand voice:** ${d.brand_voice || "Professional, trustworthy, conversion-focused"}
- **Color palette:** Primary ${d.primary_colors?.join(", ") || "(define from brand)"}, Secondary ${d.secondary_colors?.join(", ") || "—"}, Accent (pick complementary accent)
- **Typography:** ${d.typography || "Modern sans for UI; distinctive display for headlines"}
- **Design style:** Premium agency quality — avoid generic “AI slop” layouts; strong hierarchy and spacing
- **Animation:** Moderate micro-interactions; respect prefers-reduced-motion
- **Accessibility:** WCAG 2.1 AA
- **Performance:** Core Web Vitals — LCP under 2.5s, minimize CLS, fast INP

## WEBSITE STRUCTURE

- **Pages needed:** ${pages}
- **Homepage sections:** Hero, social proof, services/value props mapped to challenges, process, testimonials or logos, FAQ snippet, CTA band, footer
- **Key differentiators:** Address stated challenges: ${ctx.challenges.slice(0, 4).join("; ") || "—"}
- **Conversion path:** Awareness → credibility → CTA → form submit → thank-you state

## FEATURES AND FUNCTIONALITY

- **Lead capture:** ${d.lead_form_fields || "name, email, message"} → contact section + footer → POST to API route with validation
- **Booking system:** ${d.booking ? "Embed scheduling URL from env" : "No"}
- **E-commerce:** ${d.ecommerce ? "Yes — if product count small, static or CMS" : "No"}
- **Blog:** ${d.blog ? "Yes — MDX or markdown-driven" : "Optional"}
- **Integrations:** ${d.integrations || "Supabase optional for storage; env vars for webhooks"}
- **Analytics:** ${d.analytics_notes || "Events for CTA clicks and form submits"}

## CONTENT AND MESSAGING

- **Headline:** ${d.headline || "Lead with measurable outcome for " + ctx.industry}
- **Subheading:** ${d.subheading || "Support with proof and specificity"}
- **Primary CTA:** ${d.primary_cta || "Book a call"}
- **Secondary CTA:** ${d.secondary_cta || "View services"}
- **Brand story:** Align with success goals and current marketing: ${ctx.currentMarketing.slice(0, 200) || "—"}

## TECHNICAL REQUIREMENTS

- **Framework:** Next.js (App Router) with TypeScript
- **Styling:** Tailwind CSS
- **Components:** Reusable, composable sections
- **Database:** Supabase only if dynamic content is required; otherwise static/MDX
- **Forms:** React Hook Form + zod (or server actions with zod)
- **Images:** next/image
- **SEO:** Metadata API, Open Graph, JSON-LD where appropriate
- **Mobile:** Fully responsive
- **Dark mode:** ${d.dark_mode ? "Support via class strategy" : "Optional — default light-first"}

## FULL DESIGN BRIEF (source of truth)

${designBriefMarkdown}

## DELIVERABLES

1. Complete Next.js app structure
2. All pages built and linked
3. Responsive layouts
4. Form validation and submission handler
5. Performance-minded implementation
6. Accessible patterns (focus, labels, contrast)
7. Ready for Vercel deploy
8. .env.example for required env vars
9. Short deployment notes

BUILD THIS SITE TO PRODUCTION STANDARDS. Every component should be beautiful, fast, and conversion-focused.`;
}
