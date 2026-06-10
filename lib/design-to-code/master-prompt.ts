import type { AggregatedClientContext } from "./types";

export function buildMasterPrompt(designBriefMarkdown: string, ctx: AggregatedClientContext): string {
  const d = ctx.discovery;
  const pages =
    d.pages_needed?.length && d.pages_needed.length > 0
      ? d.pages_needed.join(", ")
      : "Home, About, Services, Contact, (optional Blog, FAQ, Pricing)";

  // Brand context — prefer CRM-extracted colors over discovery snapshot colors
  const primaryColor = ctx.brandContext?.primaryColor || d.primary_colors?.join(", ") || null;
  const darkColor = ctx.brandContext?.darkColor || null;
  const lightColor = ctx.brandContext?.lightColor || null;
  const colorPaletteStr = primaryColor
    ? `Primary ${primaryColor}${darkColor ? `, Dark ${darkColor}` : ""}${lightColor ? `, Light ${lightColor}` : ""}, Secondary ${d.secondary_colors?.join(", ") || "—"}, Accent (pick complementary accent)`
    : `Primary (define from brand), Secondary ${d.secondary_colors?.join(", ") || "—"}, Accent (pick complementary accent)`;

  const brandVoice = ctx.brandContext?.brandVoice || d.brand_voice || "Professional, trustworthy, conversion-focused";

  // Sub-niche context
  const subNicheNote = ctx.subNiche
    ? `This is specifically a ${ctx.subNiche} business within the ${ctx.industry} space.`
    : "";

  // Service area
  const serveAreaNote = ctx.serveArea ? `Service Area: ${ctx.serveArea}` : "";

  // Primary intent
  const primaryIntentNote = ctx.primaryIntent
    ? `Primary Business Need: ${ctx.primaryIntent} — design must prioritise ${
        ctx.primaryIntent === "LEADS"
          ? "lead capture forms, click-to-call CTAs, and trust signals"
          : ctx.primaryIntent === "AUTOMATION"
            ? "booking forms, admin efficiency, and self-service features"
            : ctx.primaryIntent === "PRESENCE"
              ? "local SEO signals, Google Maps integration, and credibility"
              : "overall business growth and multi-channel presence"
      }`
    : "";

  // Team / operational context
  const teamNote = ctx.teamSize ? `Team Size: ${ctx.teamSize}` : "";
  const hoursNote = ctx.hoursLostPerWeek
    ? `Hours lost to manual tasks: ${ctx.hoursLostPerWeek}/week — design should include automation/booking CTAs`
    : "";

  // Revenue tier
  const revenueTierNote = ctx.revenueRange
    ? `Revenue Range: ${ctx.revenueRange} — design quality tier should match this business scale`
    : "";

  // Social proof lines
  const socialLines: string[] = [];
  const igFollowers = ctx.socialInsights?.instagram?.followers;
  if (igFollowers) {
    const engRate = ctx.socialInsights?.instagram?.engagementRate;
    socialLines.push(
      `Instagram: ${igFollowers.toLocaleString()} followers${engRate ? `, ${engRate}% engagement` : ""}.`,
    );
  }
  const ttFollowers = ctx.socialInsights?.tiktok?.followers;
  if (ttFollowers) {
    socialLines.push(`TikTok: ${ttFollowers.toLocaleString()} followers.`);
  }
  const fbLikes = ctx.socialInsights?.facebook?.likes;
  if (fbLikes) {
    socialLines.push(`Facebook: ${fbLikes.toLocaleString()} page likes.`);
  }

  // Conversion gap context
  const conversionNote = ctx.conversionRate
    ? `Current conversion rate: ${ctx.conversionRate} out of 10 enquiries. Website design must maximize lead capture and trust signals.`
    : "";

  // Vendor history
  const vendorNote =
    ctx.previousVendorExp?.length
      ? `Client has previously used: ${ctx.previousVendorExp.join(", ")}. Position clearly as a step above.`
      : "";

  // PageSpeed note
  const speedNote =
    ctx.websiteEnrichment?.pageSpeedMobile != null
      ? `Existing site PageSpeed: Mobile ${ctx.websiteEnrichment.pageSpeedMobile}/100, Desktop ${ctx.websiteEnrichment.pageSpeedDesktop ?? "?"}/100. New site must score 90+.`
      : "";

  return `You are a world-class fullstack web developer and UI/UX designer. Your task is to build a production-ready Next.js website that solves ${ctx.company || ctx.clientName}'s business problems.

## BUSINESS CONTEXT

- **Client:** ${ctx.company || ctx.clientName}
- **Industry:** ${ctx.industry}${subNicheNote ? `\n- **Niche:** ${subNicheNote}` : ""}
- **Stage:** ${ctx.companyStage}${serveAreaNote ? `\n- **Location:** ${serveAreaNote}` : ""}
- **Main goal:** ${ctx.successGoals || "Grow qualified leads and trust"}${primaryIntentNote ? `\n- **Intent:** ${primaryIntentNote}` : ""}
- **Target customer:** ${d.feature_priorities || `Buyers in ${ctx.industry}`}
- **Competitor analysis:** Competitors listed in CRM: ${ctx.competitors.join(", ") || "—"}; differentiate on clarity, performance, and proof.${vendorNote ? `\n- **Vendor history:** ${vendorNote}` : ""}${conversionNote ? `\n- **Conversion context:** ${conversionNote}` : ""}${socialLines.length ? `\n- **Social proof:** ${socialLines.join(" ")}` : ""}${teamNote ? `\n- **Operations:** ${teamNote}` : ""}${hoursNote ? `\n- **Efficiency gap:** ${hoursNote}` : ""}

## DESIGN REQUIREMENTS

- **Brand voice:** ${brandVoice}${revenueTierNote ? `\n- **Revenue tier:** ${revenueTierNote}` : ""}
- **Color palette:** ${colorPaletteStr}
- **Typography:** ${d.typography || "Modern sans for UI; distinctive display for headlines"}
- **Design style:** Premium agency quality — avoid generic “AI slop” layouts; strong hierarchy and spacing
- **Animation:** Moderate micro-interactions; respect prefers-reduced-motion
- **Accessibility:** WCAG 2.1 AA
- **Performance:** Core Web Vitals — LCP under 2.5s, minimize CLS, fast INP${speedNote ? `; ${speedNote}` : ""}

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
