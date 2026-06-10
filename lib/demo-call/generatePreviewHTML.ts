import type { ManualFormData } from '@/types/demo-call'

// ── ClientPreviewContext ─────────────────────────────────────────────────────

export interface ClientPreviewContext {
  businessName: string;
  industry: string;
  subNiche?: string | null;
  location?: string | null;        // serve_area or location field
  primaryColor?: string | null;    // from brand context
  services?: string[] | null;      // derive from challenges[] or biggest_time_waste
  tagline?: string | null;
  phone?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  logoUrl?: string | null;
  revenueRange?: string | null;
  urgencyTimeline?: string | null;
}

// ── Industry image map (Unsplash source — always resolves) ───────────────────

const INDUSTRY_IMAGES: Record<string, { hero: string; feature: string }> = {
  'Healthcare': {
    hero: 'https://source.unsplash.com/featured/1400x800/?medical,clinic,health',
    feature: 'https://source.unsplash.com/featured/800x600/?medical,clinic,health',
  },
  'Professional Services': {
    hero: 'https://source.unsplash.com/featured/1400x800/?office,business,professional',
    feature: 'https://source.unsplash.com/featured/800x600/?office,business,professional',
  },
  'E-Commerce': {
    hero: 'https://source.unsplash.com/featured/1400x800/?shopping,ecommerce,products',
    feature: 'https://source.unsplash.com/featured/800x600/?shopping,ecommerce,products',
  },
  'Real Estate': {
    hero: 'https://source.unsplash.com/featured/1400x800/?realestate,house,property',
    feature: 'https://source.unsplash.com/featured/800x600/?realestate,house,property',
  },
  'Construction': {
    hero: 'https://source.unsplash.com/featured/1400x800/?construction,building,tools',
    feature: 'https://source.unsplash.com/featured/800x600/?construction,building,tools',
  },
  'Education': {
    hero: 'https://source.unsplash.com/featured/1400x800/?education,learning,classroom',
    feature: 'https://source.unsplash.com/featured/800x600/?education,learning,classroom',
  },
  'Hospitality': {
    hero: 'https://source.unsplash.com/featured/1400x800/?hotel,restaurant,hospitality',
    feature: 'https://source.unsplash.com/featured/800x600/?hotel,restaurant,hospitality',
  },
  'Technology': {
    hero: 'https://source.unsplash.com/featured/1400x800/?technology,software,computer',
    feature: 'https://source.unsplash.com/featured/800x600/?technology,software,computer',
  },
  'Financial Services': {
    hero: 'https://source.unsplash.com/featured/1400x800/?finance,banking,investment',
    feature: 'https://source.unsplash.com/featured/800x600/?finance,banking,investment',
  },
  'Retail': {
    hero: 'https://source.unsplash.com/featured/1400x800/?retail,store,shopping',
    feature: 'https://source.unsplash.com/featured/800x600/?retail,store,shopping',
  },
  'Food & Beverage': {
    hero: 'https://source.unsplash.com/featured/1400x800/?food,restaurant,cooking',
    feature: 'https://source.unsplash.com/featured/800x600/?food,restaurant,cooking',
  },
  'Marketing': {
    hero: 'https://source.unsplash.com/featured/1400x800/?marketing,digital,creative',
    feature: 'https://source.unsplash.com/featured/800x600/?marketing,digital,creative',
  },
  'Other': {
    hero: 'https://source.unsplash.com/featured/1400x800/?business,professional,office',
    feature: 'https://source.unsplash.com/featured/800x600/?business,professional,office',
  },
  // Legacy keyword-based fallbacks for manual mode
  plumbing: {
    hero: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80',
  },
  pipe: {
    hero: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80',
  },
  electric: {
    hero: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1497366412874-3415097a27e7?w=800&q=80',
  },
  clean: {
    hero: 'https://images.unsplash.com/photo-1527515637462-cff94abb55d1?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80',
  },
  roof: {
    hero: 'https://images.unsplash.com/photo-1632344804156-29b9e4e4a5f1?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80',
  },
  paint: {
    hero: 'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&q=80',
  },
  garden: {
    hero: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1585320806297-9794b3e4aaae?w=800&q=80',
  },
  pest: {
    hero: 'https://images.unsplash.com/photo-1558618047-3c8b02e6f2b4?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  },
  default: {
    hero: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1400&q=80',
    feature: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  },
}

function getImages(businessName: string, services: string[], industry?: string) {
  // Industry-aware lookup first
  if (industry && INDUSTRY_IMAGES[industry]) return INDUSTRY_IMAGES[industry]
  // Legacy keyword lookup
  const text = (businessName + ' ' + services.join(' ')).toLowerCase()
  for (const key of Object.keys(INDUSTRY_IMAGES)) {
    if (key !== 'default' && !key.includes(' ') && text.includes(key)) return INDUSTRY_IMAGES[key]
  }
  return INDUSTRY_IMAGES.default
}

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

/**
 * Extracts a clean business name from a URL.
 * e.g. "https://leadvelocity.co.za/services" -> "Lead Velocity"
 */
export function extractBrandFromUrl(url: string): string {
  try {
    let hostname = url
    if (!hostname.includes('//')) hostname = 'https://' + hostname
    const { host } = new URL(hostname)
    const parts = host.replace(/^www\./, '').split('.')
    const brand = parts[0]
    return brand
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/-/g, ' ')
      .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase())
  } catch {
    return 'Your Business'
  }
}

// ── Headline types ───────────────────────────────────────────────────────────

interface Headline {
  problem: string
  headline: string
  accent: string
  agitate: string
  solution: string
  ctaText: string
}

// ── Industry-aware headline map ──────────────────────────────────────────────

const INDUSTRY_HEADLINES: Record<string, Headline> = {
  'Healthcare': {
    problem: 'Long wait times? Struggling to find a trusted local provider?',
    headline: 'Get the Care',
    accent: 'You Deserve.',
    agitate: 'Delayed care leads to worse outcomes and more stress. You deserve better.',
    solution: 'Book with trusted local health professionals. Fast appointments, compassionate care.',
    ctaText: 'Book Appointment',
  },
  'Professional Services': {
    problem: 'Tired of slow responses, vague advice, and hidden fees?',
    headline: 'Expert Advice,',
    accent: 'Real Results.',
    agitate: 'Bad professional advice costs you time and money. You need a team you can trust.',
    solution: 'Clear, actionable guidance from certified professionals. Transparent pricing, guaranteed.',
    ctaText: 'Get a Consultation',
  },
  'E-Commerce': {
    problem: 'Frustrated by unreliable shipping and poor product quality?',
    headline: 'Shop Smarter,',
    accent: 'Not Harder.',
    agitate: 'Every bad online purchase wastes money and erodes trust. Find a store that delivers.',
    solution: 'Curated products, fast shipping, easy returns. Your satisfaction is guaranteed.',
    ctaText: 'Shop Now',
  },
  'Real Estate': {
    problem: 'Overwhelmed by listings? Unsure who to trust in the property market?',
    headline: 'Find Your',
    accent: 'Perfect Property.',
    agitate: 'The wrong agent costs you thousands and months of frustration. Choose wisely.',
    solution: 'Expert property guidance from local specialists. Honest advice, proven results.',
    ctaText: 'View Listings',
  },
  'Construction': {
    problem: 'Contractors who ghost you, miss deadlines, and cut corners?',
    headline: 'Built Right,',
    accent: 'The First Time.',
    agitate: 'Poor construction is expensive to fix and dangerous to live with. Don\'t settle.',
    solution: 'Quality construction and renovations backed by a written guarantee. On time, every time.',
    ctaText: 'Get a Free Quote',
  },
  'Education': {
    problem: 'Falling behind? Can\'t find the right learning path?',
    headline: 'Unlock Your',
    accent: 'Full Potential.',
    agitate: 'The wrong course wastes months and thousands. Invest in education that delivers.',
    solution: 'Structured learning programs with proven outcomes. Start your journey today.',
    ctaText: 'Enroll Now',
  },
  'Hospitality': {
    problem: 'Tired of overpriced hotels and disappointing dining experiences?',
    headline: 'Experience the',
    accent: 'Difference.',
    agitate: 'A bad hospitality experience ruins your occasion. You deserve memorable moments.',
    solution: 'Premium hospitality crafted to exceed expectations. Every visit, unforgettable.',
    ctaText: 'Make a Booking',
  },
  'Technology': {
    problem: 'Tech that slows you down, breaks constantly, and costs a fortune to fix?',
    headline: 'Technology That',
    accent: 'Actually Works.',
    agitate: 'Downtime costs businesses thousands per hour. Stop tolerating unreliable tech.',
    solution: 'Reliable technology solutions built for your business. Fast support, zero guesswork.',
    ctaText: 'Get Started',
  },
  'Financial Services': {
    problem: 'Confused by fees, poor returns, and advisors who don\'t listen?',
    headline: 'Your Money,',
    accent: 'Working Harder.',
    agitate: 'Poor financial advice can set you back years. Partner with people who put you first.',
    solution: 'Clear, fiduciary financial guidance. We grow your wealth, not our commissions.',
    ctaText: 'Book a Free Review',
  },
  'Retail': {
    problem: 'Can\'t find quality products at fair prices near you?',
    headline: 'Quality You Can',
    accent: 'Count On.',
    agitate: 'Every disappointing purchase is money you\'ll never get back. Shop with confidence.',
    solution: 'Curated retail selection with honest pricing. Local service, premium products.',
    ctaText: 'Browse Our Range',
  },
  'Food & Beverage': {
    problem: 'Bland food, inconsistent quality, and overpriced menus?',
    headline: 'Food That',
    accent: 'Brings People Together.',
    agitate: 'A bad meal ruins the moment. Life is too short for food that doesn\'t impress.',
    solution: 'Fresh ingredients, inspired recipes, unforgettable flavours. Every time.',
    ctaText: 'Order Now',
  },
  'Marketing': {
    problem: 'Spending on ads with nothing to show for it?',
    headline: 'Marketing That',
    accent: 'Drives Real Growth.',
    agitate: 'Wasted ad spend is money down the drain. You need strategies that convert.',
    solution: 'Data-driven marketing campaigns that deliver measurable ROI. No fluff, just results.',
    ctaText: 'Get a Strategy Call',
  },
  'Other': {
    problem: 'Tired of unreliable service providers that let you down?',
    headline: 'Stop Wasting Time on',
    accent: 'Providers Who Don\'t Show Up.',
    agitate: 'Every missed appointment costs you money, time, and frustration.',
    solution: 'We show up on time, do the job right, and stand behind our work — every time.',
    ctaText: 'Get a Free Quote',
  },
  // Legacy keyword-based
  plumbing: {
    problem: 'Leaking pipes? Blocked drains? Cold shower again?',
    headline: "Don't Let Plumbing Problems",
    accent: 'Drain Your Budget.',
    agitate: 'Every day you wait, water damage gets worse — and so does the repair bill.',
    solution: 'Fast, guaranteed plumbing by a licensed team. We show up on time, fix it right, and leave no mess behind.',
    ctaText: 'Book a Free Quote',
  },
  electric: {
    problem: 'Tripping breakers? Flickering lights? Unsafe wiring?',
    headline: 'Safe, Reliable Electrical',
    accent: 'Done Right First Time.',
    agitate: 'Electrical faults don\'t warn you — they just happen. Don\'t risk it.',
    solution: 'Licensed electricians, same-day response. We diagnose and fix — no guesswork.',
    ctaText: 'Book Now',
  },
  clean: {
    problem: 'No time to clean? Guests arriving? Inspection coming up?',
    headline: 'Spotless Results',
    accent: 'Every Single Time.',
    agitate: 'A dirty space costs you time, stress, and reputation. You deserve better.',
    solution: 'Professional cleaning team with eco-friendly products. Book once, love it forever.',
    ctaText: 'Book a Clean',
  },
  default: {
    problem: 'Tired of unreliable service providers that let you down?',
    headline: 'Stop Wasting Time on',
    accent: 'Providers Who Don\'t Show Up.',
    agitate: 'Every missed appointment costs you money, time, and frustration.',
    solution: 'We show up on time, do the job right, and stand behind our work — every time.',
    ctaText: 'Get a Free Quote',
  },
}

function getHeadline(businessName: string, services: string[], industry?: string): Headline {
  // Industry-aware lookup first
  if (industry && INDUSTRY_HEADLINES[industry]) return INDUSTRY_HEADLINES[industry]
  // Legacy keyword lookup
  const text = (businessName + ' ' + services.join(' ')).toLowerCase()
  for (const key of Object.keys(INDUSTRY_HEADLINES)) {
    if (key !== 'default' && !key.includes(' ') && text.includes(key)) return INDUSTRY_HEADLINES[key]
  }
  return INDUSTRY_HEADLINES.default
}

function buildPricingTiers(pricing: string): string {
  if (!pricing) return ''
  return `
  <section class="pricing">
    <h2>Simple, Transparent Pricing</h2>
    <p class="pricing-sub">No hidden fees. No surprises. Just honest quotes.</p>
    <div class="tiers">
      <div class="tier">
        <div class="tier-name">Basic</div>
        <div class="tier-price">${pricing}</div>
        <ul><li>✓ Single visit</li><li>✓ Diagnosis included</li><li>✓ Written quote</li></ul>
        <button class="tier-btn">Book Now</button>
      </div>
      <div class="tier featured">
        <div class="tier-badge">Most Popular</div>
        <div class="tier-name">Standard</div>
        <div class="tier-price">Call for quote</div>
        <ul><li>✓ Full service</li><li>✓ Parts included</li><li>✓ 30-day guarantee</li></ul>
        <button class="tier-btn">Get a Quote</button>
      </div>
      <div class="tier">
        <div class="tier-name">Premium</div>
        <div class="tier-price">Annual plan</div>
        <ul><li>✓ Priority callouts</li><li>✓ Unlimited visits</li><li>✓ 12-month warranty</li></ul>
        <button class="tier-btn">Learn More</button>
      </div>
    </div>
  </section>`
}

/**
 * Generates a beautiful "Website" mockup locally when a real screenshot isn't available.
 */
export function generateFallbackWebsiteHTML(url: string): string {
  const brand = extractBrandFromUrl(url)
  return generatePreviewHTML({
    businessName: brand,
    location: 'Your Area',
    pricing: 'Request Quote',
    services: 'Professional Services\n24/7 Support\nExpert Consultation',
  })
}

/**
 * Core HTML generator. Accepts either ManualFormData (legacy) or ClientPreviewContext (client-search path).
 */
export function generatePreviewHTML(data: ManualFormData | ClientPreviewContext): string {
  let services: string[]
  let name: string
  let location: string
  let pricing: string
  let primaryColor: string
  let industry: string | undefined
  let phone: string | null | undefined
  let googleRating: number | null | undefined
  let googleReviewCount: number | null | undefined

  if ('industry' in data) {
    // ClientPreviewContext path
    const ctx = data as ClientPreviewContext
    services = ctx.services ?? []
    name = toTitleCase(ctx.businessName || 'Your Business')
    location = toTitleCase(ctx.location || 'Your Area')
    pricing = ''
    primaryColor = ctx.primaryColor || '#f97316'
    industry = ctx.industry
    phone = ctx.phone
    googleRating = ctx.googleRating
    googleReviewCount = ctx.googleReviewCount
    // Urgency-aware CTA override
    if (ctx.urgencyTimeline === 'ASAP — I need this now') {
      // will override headline ctaText below
      ;(data as ClientPreviewContext & { _ctaOverride?: string })._ctaOverride = 'Get Started Today'
    } else if (ctx.urgencyTimeline === 'Within the next month') {
      ;(data as ClientPreviewContext & { _ctaOverride?: string })._ctaOverride = 'Book a Free Consultation'
    }
  } else {
    // ManualFormData path
    const manual = data as ManualFormData
    services = manual.services.split('\n').map((s) => s.trim()).filter(Boolean)
    name = toTitleCase(manual.businessName || 'Your Business')
    location = toTitleCase(manual.location || 'Your Area')
    pricing = manual.pricing
    primaryColor = '#f97316'
    phone = null
    googleRating = null
    googleReviewCount = null
  }

  const imgs = getImages(name, services, industry)
  const h = getHeadline(name, services, industry)
  const serviceItems = services.map((s) => `<li><span class="svc-icon">✓</span>${toTitleCase(s)}</li>`).join('')

  // Build heading template with location substitution
  const headlineText = h.headline
  const accentText = h.accent.replace('{location}', location)
  const solutionText = h.solution.replace('{location}', location)
  const ctaOverride = ('industry' in data)
    ? (data as ClientPreviewContext & { _ctaOverride?: string })._ctaOverride
    : undefined
  const ctaText = ctaOverride ?? h.ctaText

  // Rating badge HTML
  const ratingBadge = googleRating
    ? `<span>⭐ ${googleRating}/5 (${googleReviewCount ?? ''}${googleReviewCount ? ' reviews' : 'rated'})</span>`
    : `<span>⭐ 4.9/5 Rating</span>`

  // Phone CTA
  const phoneCtaHtml = phone
    ? `<button class="btn-white" onclick="window.location.href='tel:${phone}'">📞 Call ${phone}</button>`
    : `<button class="btn-white">📞 Get a Free Quote Now</button>`

  const c = primaryColor

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;scrollbar-width:none}
*::-webkit-scrollbar{display:none}
body{font-family:'Inter',system-ui,sans-serif;background:#fff;color:#1a1a2e}
/* NAV */
.nav{display:flex;justify-content:space-between;align-items:center;padding:14px 28px;background:rgba(255,255,255,0.95);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;border-bottom:1px solid rgba(0,0,0,0.08)}
.logo{font-weight:800;font-size:16px;letter-spacing:-0.5px}
.logo span{color:${c}}
.nav-btn{background:${c};color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
/* HERO */
.hero{position:relative;min-height:520px;display:flex;align-items:center;overflow:hidden}
.hero-bg{position:absolute;inset:0;background-image:url('${imgs.hero}');background-size:cover;background-position:center}
.hero-overlay{position:absolute;inset:0;background:linear-gradient(105deg,rgba(10,22,40,0.88) 0%,rgba(10,22,40,0.55) 60%,rgba(10,22,40,0.2) 100%)}
.hero-content{position:relative;z-index:1;padding:60px 32px;max-width:600px}
.hero-badge{display:inline-block;background:rgba(249,115,22,0.2);border:1px solid rgba(249,115,22,0.5);color:#fb923c;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 14px;border-radius:20px;margin-bottom:20px;text-transform:uppercase}
.hero h1{font-size:clamp(28px,4.5vw,46px);font-weight:900;line-height:1.1;color:#fff;letter-spacing:-1px;margin-bottom:8px}
.hero h1 span{color:${c};display:block}
.hero-sub{font-size:15px;color:rgba(255,255,255,0.75);line-height:1.65;margin:16px 0 28px;max-width:480px}
.hero-ctas{display:flex;gap:12px;flex-wrap:wrap}
.btn-primary{background:${c};color:#fff;border:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}
.btn-secondary{background:transparent;color:#fff;border:2px solid rgba(255,255,255,0.3);padding:14px 22px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
.trust{display:flex;gap:16px;flex-wrap:wrap;margin-top:24px;font-size:12px;color:rgba(255,255,255,0.7)}
.trust span{display:flex;align-items:center;gap:5px}
/* PROBLEM */
.problem{background:#fef3ec;padding:52px 32px;text-align:center}
.problem-label{font-size:12px;font-weight:700;letter-spacing:2px;color:${c};text-transform:uppercase;margin-bottom:12px}
.problem h2{font-size:clamp(20px,3vw,28px);font-weight:800;color:#1a1a2e;max-width:560px;margin:0 auto 16px}
.problem p{font-size:14px;color:#64748b;max-width:480px;margin:0 auto;line-height:1.7}
/* SOLUTION */
.solution{padding:52px 32px;background:#fff}
.solution-inner{max-width:900px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.solution-img img{width:100%;border-radius:14px;object-fit:cover;height:280px}
.solution-text h2{font-size:clamp(20px,2.5vw,26px);font-weight:800;color:#1a1a2e;margin-bottom:12px}
.solution-text p{font-size:14px;color:#64748b;line-height:1.7;margin-bottom:20px}
.services-list{list-style:none;display:grid;gap:8px}
.services-list li{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#1a1a2e}
.svc-icon{background:${c};color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
/* TESTIMONIAL */
.testimonial{background:#0a1628;padding:52px 32px;text-align:center;color:#fff}
.stars{font-size:20px;margin-bottom:16px;letter-spacing:3px}
.testimonial blockquote{font-size:clamp(16px,2vw,20px);font-style:italic;max-width:600px;margin:0 auto 20px;line-height:1.6;color:rgba(255,255,255,0.9)}
.testimonial cite{font-size:13px;color:rgba(255,255,255,0.5);font-style:normal}
/* CTA STRIP */
.cta-strip{background:linear-gradient(135deg,${c},${c}cc);padding:40px 32px;text-align:center}
.cta-strip h2{font-size:clamp(18px,2.5vw,24px);font-weight:900;color:#fff;margin-bottom:8px}
.cta-strip p{font-size:14px;color:rgba(255,255,255,0.85);margin-bottom:24px}
.cta-strip .btn-white{background:#fff;color:${c};border:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
/* PRICING */
.pricing{padding:52px 32px;background:#f8fafc;text-align:center}
.pricing h2{font-size:clamp(20px,2.5vw,26px);font-weight:800;color:#1a1a2e;margin-bottom:8px}
.pricing-sub{font-size:13px;color:#64748b;margin-bottom:32px}
.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:820px;margin:0 auto}
.tier{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px 20px;position:relative}
.tier.featured{border:2px solid ${c};box-shadow:0 8px 32px rgba(249,115,22,0.15)}
.tier-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:${c};color:#fff;font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;white-space:nowrap;letter-spacing:0.5px}
.tier-name{font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.tier-price{font-size:20px;font-weight:900;color:#1a1a2e;margin-bottom:16px}
.tier ul{list-style:none;margin-bottom:20px;display:grid;gap:6px;text-align:left}
.tier li{font-size:12px;color:#64748b}
.tier-btn{width:100%;background:#1a1a2e;color:#fff;border:none;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.tier.featured .tier-btn{background:${c}}
/* CHAT */
.chat-wrap{position:fixed;bottom:20px;right:20px;z-index:999}
.chat-bubble-msg{background:#fff;border:1px solid #e2e8f0;border-radius:16px 16px 4px 16px;padding:12px 16px;font-size:12px;color:#1a1a2e;box-shadow:0 8px 32px rgba(0,0,0,0.12);max-width:200px;margin-bottom:8px;line-height:1.5;font-weight:500}
.chat-icon-btn{width:48px;height:48px;background:linear-gradient(135deg,${c},${c}cc);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(249,115,22,0.4);cursor:pointer;margin-left:auto}
.chat-dot{width:10px;height:10px;background:#22c55e;border-radius:50%;position:absolute;top:2px;right:2px;border:2px solid #fff}
</style>
</head>
<body>

<nav class="nav">
  <div class="logo">${name.toLowerCase().replace(/\s+/g, '')}<span>Pro</span></div>
  <button class="nav-btn">📋 ${ctaText}</button>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <div class="hero-badge">⭐ #1 Rated in ${location}</div>
    <h1>${headlineText}<span>${accentText}</span></h1>
    <p class="hero-sub">${solutionText}</p>
    <div class="hero-ctas">
      <button class="btn-primary">📋 ${ctaText}</button>
      <button class="btn-secondary">See Our Services →</button>
    </div>
    <div class="trust">
      ${ratingBadge}
      <span>✅ Licensed &amp; Insured</span>
      <span>🕐 Same-Day Service</span>
      ${pricing ? `<span>💳 ${pricing}</span>` : '<span>🚫 No Hidden Fees</span>'}
    </div>
  </div>
</section>

<section class="problem">
  <div class="problem-label">Sound familiar?</div>
  <h2>${h.problem}</h2>
  <p>${h.agitate}</p>
</section>

<section class="solution">
  <div class="solution-inner">
    <div class="solution-img">
      <img src="${imgs.feature}" alt="${name} at work" loading="lazy"/>
    </div>
    <div class="solution-text">
      <h2>Why ${location} Trusts ${name}</h2>
      <p>${solutionText} Serving ${location} with pride.</p>
      ${services.length > 0 ? `<ul class="services-list">${serviceItems}</ul>` : ''}
    </div>
  </div>
</section>

<section class="testimonial">
  <div class="stars">★★★★★</div>
  <blockquote>"I called ${name} on a Friday evening — they were there within the hour and fixed everything. Honest pricing, no drama. Won't use anyone else."</blockquote>
  <cite>— Sarah M., ${location}</cite>
</section>

<section class="cta-strip">
  <h2>Ready to Get Started Today?</h2>
  <p>Same-day service available. Call now or book online — we respond in minutes.</p>
  ${phoneCtaHtml}
</section>

${pricing ? buildPricingTiers(pricing) : ''}

<div class="chat-wrap">
  <div class="chat-bubble-msg">Hi! I'm the AI agent for ${name} — how can I help? 👋</div>
  <div style="position:relative">
    <div class="chat-icon-btn">💬</div>
    <div class="chat-dot"></div>
  </div>
</div>

</body>
</html>`
}

export function getDefaultPreviewHTML(): string {
  return generatePreviewHTML({
    businessName: 'plumbing',
    location: 'pretoria east',
    pricing: 'call out fee R300',
    services: 'leak detection\ntoilets\ngeyser installation',
  })
}
