export const DEFAULT_REVIEW_CHECKLIST = {
  design_colors_fonts_layout: false,
  all_pages_working: false,
  forms_submit: false,
  mobile_great: false,
  loading_fast: false,
  copy_correct: false,
  ctas_clear: false,
  ready_to_approve: false,
} as const;

export type ReviewChecklistState = Record<string, boolean>;

export function buildReviewChecklistMarkdown(clientName: string): string {
  return `## Client review checklist — ${clientName}

| Item | Done |
|------|------|
| Design looks right (colors, fonts, layout) | [ ] |
| All pages present and working | [ ] |
| Forms submit correctly | [ ] |
| Mobile looks great | [ ] |
| Loading speed is acceptable | [ ] |
| Copy and messaging correct | [ ] |
| CTAs clear and working | [ ] |
| **Ready to approve** | [ ] |

_Store checked state in CRM \`client_design_to_code.review_checklist\` as JSON._`;
}
