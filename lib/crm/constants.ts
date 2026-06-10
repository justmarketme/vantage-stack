export const CLIENT_STATUS = {
  LEAD: "lead",
  PROSPECT: "prospect",
  ACTIVE: "active",
  PAUSED: "paused",
  CHURNED: "churned",
} as const;

export type ClientStatus = typeof CLIENT_STATUS[keyof typeof CLIENT_STATUS];
