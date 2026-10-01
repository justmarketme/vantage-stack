/*
 * Placeholder reward graphics — simple SVG shapes, no third-party logos.
 * Swap for real artwork later without touching the leaderboard logic.
 * Colours: neutral surfaces + the progress (green) token when earned, so the
 * art never competes with data (Rams).
 */

import { cx } from "../utils";

/** A generic gift-voucher card with the words "Takealot voucher" (text only — no logo). */
export function VoucherArt({ earned, amount, className }: { earned: boolean; amount?: string; className?: string }) {
  const stroke = earned ? "var(--cp-progress)" : "var(--cp-border-strong)";
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label={`Takealot voucher${amount ? ` ${amount}` : ""}${earned ? " — earned" : ""}`} className={cx("h-auto w-full", className)}>
      <rect x="2" y="2" width="156" height="96" rx="12" fill="var(--cp-surface-2)" stroke={stroke} strokeWidth="2" />
      {/* perforation notch */}
      <circle cx="112" cy="2" r="7" fill="var(--cp-surface)" stroke={stroke} strokeWidth="2" />
      <circle cx="112" cy="98" r="7" fill="var(--cp-surface)" stroke={stroke} strokeWidth="2" />
      <line x1="112" y1="12" x2="112" y2="88" stroke={stroke} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="14" y="34" fill="var(--cp-muted)" fontSize="10" fontFamily="inherit" letterSpacing="1.5">
        GIFT VOUCHER
      </text>
      <text x="14" y="58" fill="var(--cp-text)" fontSize="15" fontWeight="600" fontFamily="inherit">
        Takealot
      </text>
      <text x="14" y="76" fill="var(--cp-text)" fontSize="13" fontFamily="inherit">
        voucher
      </text>
      {amount && (
        <text x="136" y="56" textAnchor="middle" fill={earned ? "var(--cp-progress)" : "var(--cp-muted)"} fontSize="13" fontWeight="600" fontFamily="inherit">
          {amount}
        </text>
      )}
    </svg>
  );
}

/** A T-shirt outline with the "VS" mark — "VantageStack apparel". */
export function ApparelArt({ earned, className }: { earned: boolean; className?: string }) {
  const stroke = earned ? "var(--cp-progress)" : "var(--cp-border-strong)";
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label={`VantageStack apparel${earned ? " — earned" : ""}`} className={cx("h-auto w-full", className)}>
      <path
        d="M58 10 L44 14 L22 30 L32 46 L44 38 L44 92 L116 92 L116 38 L128 46 L138 30 L116 14 L102 10 C98 20 90 24 80 24 C70 24 62 20 58 10 Z"
        fill="var(--cp-surface-2)"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <text x="80" y="64" textAnchor="middle" fill={earned ? "var(--cp-progress)" : "var(--cp-text)"} fontSize="20" fontWeight="700" fontFamily="inherit" letterSpacing="1">
        VS
      </text>
    </svg>
  );
}
