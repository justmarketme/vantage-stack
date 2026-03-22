import type { WeeklyMetrics } from "./weekly";

function fmtInt(n: number) {
  return Math.round(n).toLocaleString();
}

function fmtUsd(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtPct01(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function insightLine(m: WeeklyMetrics) {
  const pct = m.wow.visitors_delta_pct;
  if (m.wow.trend === "positive" && pct != null) {
    return `Great week — traffic jumped ${(pct * 100).toFixed(0)}%. Keep this momentum going.`;
  }
  if (m.wow.trend === "negative" && pct != null) {
    return `Heads up — traffic dropped ${Math.abs(pct * 100).toFixed(0)}% week-over-week. We should diagnose the biggest source of the dip.`;
  }
  if (m.wow.trend === "flat") {
    return `Traffic was flat week-over-week. The fastest gains usually come from tightening conversion and follow-up speed.`;
  }
  return m.wow.trend === "positive"
    ? `Great week — traffic increased week-over-week.`
    : m.wow.trend === "negative"
      ? `Heads up — traffic decreased week-over-week.`
      : `Traffic was steady week-over-week.`;
}

function upsellSuggestion(m: WeeklyMetrics) {
  const visitors = m.totals.visitors;
  const conv = m.totals.conversion_rate;
  if (visitors >= 2000 && conv < 0.02) {
    return {
      title: "Conversion Optimization (CRO)",
      why: "You have enough traffic volume—improving the visitor→lead flow will lift leads without buying more clicks.",
      cta: "Reply “CRO” and we’ll send a 2-week optimization plan.",
    };
  }
  if (visitors < 2000 && conv >= 0.03) {
    return {
      title: "Scale Traffic (SEO + Ads)",
      why: "Your conversion rate is solid; scaling qualified traffic is the cleanest lever to grow leads.",
      cta: "Reply “SCALE” and we’ll map the fastest growth channels for next week.",
    };
  }
  return {
    title: "Scale What’s Working",
    why: "This is a strong baseline—now we can expand budget and coverage while protecting conversion rate.",
    cta: "Reply “SCALE” and we’ll propose a conservative scaling plan.",
  };
}

function topOpportunities(m: WeeklyMetrics) {
  const ops: string[] = [];
  if (m.wow.trend === "negative") ops.push("Audit traffic sources and identify where the drop came from (organic, paid, referral).");
  if (m.totals.conversion_rate < 0.02) ops.push("Improve CTA clarity and reduce form friction to lift conversion rate.");
  if (m.totals.cost_per_lead_usd != null && m.totals.cost_per_lead_usd > 50) ops.push("Tighten ad targeting + exclude low-intent placements to reduce cost per lead.");
  if (m.totals.revenue_attributed_usd == null) ops.push("Add revenue attribution tracking (so we can optimize to profit, not just leads).");
  if (!ops.length) ops.push("Document what drove the week’s wins and replicate it across the top landing pages/campaigns.");
  return ops.slice(0, 3);
}

function sparklineSvg(points: number[]) {
  const w = 520;
  const h = 120;
  const pad = 10;
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const range = Math.max(1, max - min);

  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1));
  const ys = points.map((p) => pad + (h - pad * 2) * (1 - (p - min) / range));

  const d = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i]!.toFixed(1)}`)
    .join(" ");

  return `
  <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Traffic trend">
    <defs>
      <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="#0b1220"/>
    <path d="${d}" fill="none" stroke="#38bdf8" stroke-width="3" />
    <path d="${d} L ${xs[xs.length - 1]!.toFixed(1)} ${(h - pad).toFixed(1)} L ${xs[0]!.toFixed(1)} ${(h - pad).toFixed(1)} Z" fill="url(#g)" />
  </svg>
  `.trim();
}

export function buildWeeklyEmail(params: { client_name: string; metrics: WeeklyMetrics }) {
  const { client_name, metrics: m } = params;

  const subject = `Weekly performance summary — ${client_name}`;
  const upsell = upsellSuggestion(m);
  const opportunities = topOpportunities(m);
  const trendPoints = m.daily_visitors_last_14d.map((d) => d.visitors);

  const html = `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#060914; padding:24px;">
    <div style="max-width:720px; margin:0 auto; background:#0a1020; border:1px solid #18233f; border-radius:18px; padding:22px;">
      <div style="color:#cbd5e1; font-size:13px; letter-spacing:0.08em; text-transform:uppercase;">VantageStack • Weekly Performance</div>
      <h2 style="color:#ffffff; margin:10px 0 0; font-size:22px;">Hi ${client_name}, here’s your last 7 days.</h2>
      <p style="color:#cbd5e1; line-height:1.6; margin:10px 0 16px;">${insightLine(m)}</p>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin:18px 0;">
        <div style="background:#070b16; border:1px solid #18233f; border-radius:14px; padding:14px;">
          <div style="color:#94a3b8; font-size:12px;">Website visitors</div>
          <div style="color:#fff; font-size:20px; margin-top:4px;">${fmtInt(m.totals.visitors)}</div>
          <div style="color:${m.wow.trend === "negative" ? "#fb7185" : m.wow.trend === "positive" ? "#34d399" : "#94a3b8"}; font-size:12px; margin-top:2px;">
            WoW: ${m.wow.visitors_delta >= 0 ? "+" : ""}${fmtInt(m.wow.visitors_delta)}${m.wow.visitors_delta_pct != null ? ` (${(m.wow.visitors_delta_pct * 100).toFixed(0)}%)` : ""}
          </div>
        </div>
        <div style="background:#070b16; border:1px solid #18233f; border-radius:14px; padding:14px;">
          <div style="color:#94a3b8; font-size:12px;">New leads</div>
          <div style="color:#fff; font-size:20px; margin-top:4px;">${fmtInt(m.totals.new_leads)}</div>
          <div style="color:#94a3b8; font-size:12px; margin-top:2px;">Conversion rate: ${fmtPct01(m.totals.conversion_rate)}</div>
        </div>
        <div style="background:#070b16; border:1px solid #18233f; border-radius:14px; padding:14px;">
          <div style="color:#94a3b8; font-size:12px;">Cost per lead (ads)</div>
          <div style="color:#fff; font-size:20px; margin-top:4px;">${m.totals.cost_per_lead_usd == null ? "—" : fmtUsd(m.totals.cost_per_lead_usd)}</div>
          <div style="color:#64748b; font-size:12px; margin-top:2px;">Only shown when spend + leads exist</div>
        </div>
        <div style="background:#070b16; border:1px solid #18233f; border-radius:14px; padding:14px;">
          <div style="color:#94a3b8; font-size:12px;">Revenue attributed</div>
          <div style="color:#fff; font-size:20px; margin-top:4px;">${m.totals.revenue_attributed_usd == null ? "—" : fmtUsd(m.totals.revenue_attributed_usd)}</div>
          <div style="color:#64748b; font-size:12px; margin-top:2px;">If attribution is configured</div>
        </div>
      </div>

      <div style="margin:18px 0 14px;">
        <div style="color:#94a3b8; font-size:12px; margin-bottom:8px;">Traffic trend (last 14 days)</div>
        ${sparklineSvg(trendPoints.length ? trendPoints : [0, 0, 0, 0, 0, 0, 0])}
      </div>

      <div style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap:12px; margin-top:14px;">
        <div style="background:#070b16; border:1px solid #18233f; border-radius:14px; padding:14px;">
          <div style="color:#ffffff; font-weight:700; margin-bottom:8px;">Top opportunities this week</div>
          <ol style="margin:0; padding-left:18px; color:#cbd5e1; line-height:1.6;">
            ${opportunities.map((o) => `<li>${o}</li>`).join("")}
          </ol>
        </div>
        <div style="background:#070b16; border:1px solid #18233f; border-radius:14px; padding:14px;">
          <div style="color:#ffffff; font-weight:700;">Upsell: ${upsell.title}</div>
          <p style="color:#cbd5e1; line-height:1.6; margin:8px 0 12px;">${upsell.why}</p>
          <div style="background:#0b1220; border:1px solid #1f2a44; border-radius:12px; padding:10px; color:#93c5fd; font-size:13px;">
            ${upsell.cta}
          </div>
        </div>
      </div>

      <div style="margin-top:18px; color:#64748b; font-size:12px;">
        Window: ${m.week_window.since_iso.slice(0, 10)} → ${m.week_window.until_iso.slice(0, 10)} (UTC)
      </div>
    </div>
  </div>
  `.trim();

  return { subject, html };
}

