/**
 * Direct Cal.com v2 API client for booking VantageStack Discovery Calls.
 *
 * We own the booking transaction in our own code (rather than via ElevenLabs
 * native tools) so it is deterministic and idempotent — no double-booking from a
 * stateless agent replay. Used by the WhatsApp Isabel handler.
 */

const CAL_BASE = "https://api.cal.com/v2";
const TZ = "Africa/Johannesburg";

function apiKey(): string {
  // Value may carry an inline comment in .env; take the first token.
  return (process.env.CALCOM_API_KEY || "").trim().split(/\s+/)[0];
}

export function eventTypeId(): number {
  const raw = (process.env.CALCOM_EVENT_TYPE_ID || "").trim();
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Public self-serve booking link (fallback path). */
export function bookingLink(): string {
  return "https://cal.com/vantagestack/discovery-call";
}

export type Slot = { start: string }; // ISO 8601 with offset

/** Fetch available slots between two ISO instants. Returns a flat, sorted list. */
export async function getSlots(startISO: string, endISO: string): Promise<Slot[]> {
  const key = apiKey();
  const evt = eventTypeId();
  if (!key || !evt) return [];
  const url = `${CAL_BASE}/slots?eventTypeId=${evt}&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&timeZone=${encodeURIComponent(TZ)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, "cal-api-version": "2024-09-04" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: Record<string, Array<{ start: string }>> };
  const data = json.data || {};
  const slots: Slot[] = [];
  for (const day of Object.keys(data)) for (const s of data[day] || []) slots.push({ start: s.start });
  slots.sort((a, b) => +new Date(a.start) - +new Date(b.start));
  return slots;
}

/** Upcoming slots over the next `days` days (default 14). */
export async function getUpcomingSlots(days = 14): Promise<Slot[]> {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000); // +1h, avoid past
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return getSlots(start.toISOString(), end.toISOString());
}

export type SlotMatch = { exact: Slot | null; nearest: Slot | null; alternatives: Slot[] };

/**
 * Match a preferred ISO datetime against availability.
 * - exact: a slot within 20 minutes of the preferred time
 * - nearest: closest available slot to the preference
 * - alternatives: up to 3 soonest upcoming slots (for offering choices)
 */
export async function matchSlot(preferredISO: string | null): Promise<SlotMatch> {
  const slots = await getUpcomingSlots(14);
  if (slots.length === 0) return { exact: null, nearest: null, alternatives: [] };

  const pref = preferredISO ? new Date(preferredISO) : null;
  const prefValid = pref && !Number.isNaN(+pref);

  let exact: Slot | null = null;
  let nearest: Slot | null = null;
  if (prefValid) {
    let best = Infinity;
    for (const s of slots) {
      const diff = Math.abs(+new Date(s.start) - +pref!);
      if (diff < best) { best = diff; nearest = s; }
      if (diff <= 20 * 60 * 1000 && !exact) exact = s;
    }
  }
  return { exact, nearest, alternatives: slots.slice(0, 3) };
}

export type BookingResult =
  | { ok: true; uid: string; start: string }
  | { ok: false; error: string };

/** Create a confirmed booking for the given slot. */
export async function createBooking(params: {
  startISO: string;
  name: string;
  email: string;
  notes?: string;
}): Promise<BookingResult> {
  const key = apiKey();
  const evt = eventTypeId();
  if (!key || !evt) return { ok: false, error: "calcom_not_configured" };

  const body = {
    start: params.startISO,
    eventTypeId: evt,
    attendee: { name: params.name, email: params.email, timeZone: TZ, language: "en" },
    ...(params.notes ? { metadata: { notes: params.notes.slice(0, 480) } } : {}),
  };

  const res = await fetch(`${CAL_BASE}/bookings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "cal-api-version": "2024-08-13", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; data?: { uid?: string; start?: string }; error?: { message?: string } };
  if (!res.ok || json.status === "error") {
    return { ok: false, error: (json.error?.message || `http_${res.status}`).slice(0, 160) };
  }
  const uid = json.data?.uid;
  if (!uid) return { ok: false, error: "no_uid_in_response" };
  return { ok: true, uid, start: json.data?.start || params.startISO };
}

/** Cancel a booking (used for test cleanup). */
export async function cancelBooking(uid: string, reason = "test"): Promise<boolean> {
  const key = apiKey();
  if (!key) return false;
  const res = await fetch(`${CAL_BASE}/bookings/${encodeURIComponent(uid)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "cal-api-version": "2024-08-13", "Content-Type": "application/json" },
    body: JSON.stringify({ cancellationReason: reason }),
  });
  return res.ok;
}

/** Human-friendly SAST time, e.g. "Wed 18 Jun at 2:00 PM". */
export function formatSlot(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: TZ, weekday: "short", day: "2-digit", month: "short",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
