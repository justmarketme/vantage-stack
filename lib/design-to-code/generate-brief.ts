import type { AggregatedClientContext } from "./types";

function bulletList(items: string[], fallback: string): string {
  const xs = items.filter(Boolean);
  if (!xs.length) return `- ${fallback}`;
  return xs.map((x) => `- ${x}`).join("\n");
}

function competitorBlocks(ctx: AggregatedClientContext): string {
  const extra = ctx.competitorAnalysisExtra.trim();
  const comps = ctx.competitors.length ? ctx.competitors : ["(none listed — add competitors in CRM)"];
  return comps
    .slice(0, 5)
    .map((name, i) => {
      const label = `Top competitor ${i + 1}`;
      return `${label}: ${name} — strengths: (complete after live site review: positioning, offer clarity, trust signals), weaknesses: (UX friction, messaging gaps, performance — validate in browser)`;
    })
    .join("\n\n")
    .concat(
      extra
        ? `\n\nAdditional competitive notes from CRM:\n${extra}`
        : "\n\n_Gap we're filling: differentiate on clarity, speed, and proof — align with success goals below after stakeholder review._",
    );
}

export function buildDesignBriefMarkdown(ctx: AggregatedClientContext): string {
  const d = ctx.discovery;
  const brandVoice = d.brand_voice || "professional (refine after discovery call notes)";
  const primary = d.primary_colors?.length ? d.primary_colors.join(", ") : "(not set — extract from brand guidelines)";
  const secondary = d.secondary_colors?.length ? d.secondary_colors.join(", ") : "(not set)";
  const typo = d.typography || "sans-serif, modern (confirm brand fonts)";
  const audience =
    d.feature_priorities ||
    `Decision-makers in ${ctx.industry} seeking measurable marketing outcomes; align messaging to challenges: ${ctx.challenges.slice(0, 2).join("; ") || "—"}.`;

  return `## Design Brief for ${ctx.company || ctx.clientName}

**Industry:** ${ctx.industry || "—"}  
**Company Stage:** ${ctx.companyStage}  
**Target Audience:** ${audience}

### Brand Identity

- **Brand voice:** ${brandVoice}
- **Primary colors:** ${primary}
- **Secondary colors:** ${secondary}
- **Typography:** ${typo}
- **Logo:** Top-left header; preserve clear space; SVG preferred for web

### Competitive Landscape

${competitorBlocks(ctx)}

### Website Structure and Pages

- **Homepage:** Hero with primary value prop, proof strip, services snapshot, testimonial or metrics, strong primary CTA, secondary CTA, footer with contact
- **About:** Story, mission, team optional, trust cues
- **Services / Products:** Showcase offers mapped to challenges: ${ctx.challenges.slice(0, 3).join(", ") || "—"}; pricing table TBD (${d.ecommerce ? "e-commerce pricing" : "lead-gen focus"})
- **Case studies / Portfolio:** ${d.blog ? "Include if assets exist" : "Optional — enable when collateral ready"}
- **Blog:** ${d.blog ? "Yes — start with 3 placeholder posts behind feature flag or static MDX" : "Optional / phase 2"}
- **Contact / Lead form:** ${d.lead_form_fields || "Name, email, company, message; optional phone"}; embed above fold on contact and end of key pages
- **Pricing:** ${d.ecommerce ? "Yes — product-led" : "Optional — consultative funnel"}
- **FAQ:** Recommended for SEO + objection handling (${ctx.industry})

### Key Features and Functionality

- **Lead capture:** ${d.lead_form_fields || "Standard B2B fields"}; footer + contact page; post-submit: thank-you + CRM event (existing pipeline)
- **Booking system:** ${d.booking ? "Yes — embed Cal.com / Calendly-style (env-driven URL)" : "No — CTA to contact"}
- **E-commerce:** ${d.ecommerce ? "Yes" : "No"}
- **CMS:** ${d.blog ? "Blog + case studies via MDX or Supabase content tables" : "Static first; CMS phase 2"}
- **Email capture:** Newsletter optional in footer; double opt-in if enabled
- **Analytics:** ${d.analytics_notes || "Page views, CTA clicks, form submits, scroll depth on hero"}
- **Integrations:** ${d.integrations || "CRM webhooks, email provider, Zapier optional"}

### Design Preferences

- **Layout:** Centered max-width content, generous whitespace, grid-based sections
- **Animation level:** moderate (respect prefers-reduced-motion)
- **Mobile-first:** Yes — responsive priority
- **Accessibility:** WCAG 2.1 AA
- **Loading performance:** Core Web Vitals priority (LCP, CLS, INP)

### Content

- **Headline / tagline:** ${d.headline || `(derive from) ${ctx.successGoals.slice(0, 120) || "Your growth partner in " + ctx.industry}`}
- **Subheading:** ${d.subheading || "Supporting proof and outcome-focused copy"}
- **Primary CTA:** ${d.primary_cta || "Book a strategy call"}
- **Secondary CTA:** ${d.secondary_cta || "View services"}
- **Content tone:** ${brandVoice.includes("casual") ? "conversational" : "clear, confident, helpful"}
- **Content provided:** Blueprint + CRM notes for facts; marketing polish in generation pass

### CRM Context (automated)

**Challenges (blueprint):**  
${bulletList(ctx.challenges, "—")}

**Tools in use:**  
${bulletList(ctx.toolsUsed, "—")}

**Current marketing:**  
${ctx.currentMarketing || "—"}

**Success goals:**  
${ctx.successGoals || "—"}

**Monthly budget (indicative):** ${ctx.monthlyBudget}

**Latest site health score (if available):** ${ctx.healthScore != null ? String(ctx.healthScore) : "—"}

### Discovery & call notes

${ctx.notesJoined ? ctx.notesJoined : "_No notes in CRM — add discovery notes to client_notes for richer output._"}

### Success Metrics

- **Primary goal:** ${d.success_metric || "Lead capture and qualified conversations"}
- **Target conversion rate:** (set with client)
- **Key pages to optimize:** Homepage, primary service page, contact

---
_Generated by VantageStack design-to-code engine from CRM profile. Refine competitive strengths/weaknesses after manual site review._
`;
}
