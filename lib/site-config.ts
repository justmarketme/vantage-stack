// Single source of site-wide config.
//
// `reviews` feeds the distributed trust signals on the landing pages (hero
// rating bar + final-CTA trust line). Populate `rating` / `count` from the
// Google Business Profile when available. Until then they stay null and the
// trust signals render CLEARLY-BRACKETED PLACEHOLDERS ([4.8] / [120]) — we never
// render an invented number as fact. Set `hideWhenUnset: true` to hide the
// signals entirely instead of showing placeholders.
//
// Finding (SEO_Automation/configs/landing_page_research.json): distributed trust
// (rating near the hero + at the CTA) converts better than one stacked block;
// as a new business we use honest signals only (no fake logos/proof).

export const siteConfig = {
  reviews: {
    rating: null as number | null, // e.g. 4.8
    count: null as number | null, // e.g. 120
    hideWhenUnset: false,
    placeholderRating: "4.8",
    placeholderCount: "120",
  },
};
