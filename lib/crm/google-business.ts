/**
 * Google Business lookup via Serper.dev Maps API.
 * Returns null gracefully if SERPER_API_KEY is not configured or on any error.
 */

export interface GoogleBusinessData {
  category: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  hours: string | null;
  website: string | null;
}

type SerperPlace = {
  title?: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  phoneNumber?: string;
  website?: string;
  hours?: string | Record<string, string>;
};

function parseHours(raw: string | Record<string, string> | undefined): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  return Object.entries(raw)
    .map(([day, hours]) => `${day}: ${hours}`)
    .join(", ");
}

export async function lookupGoogleBusiness(
  businessName: string,
  location?: string,
): Promise<GoogleBusinessData | null> {
  const apiKey = (process.env.SERPER_API_KEY ?? "").trim();
  if (!apiKey) return null;

  try {
    const q = [businessName, location].filter(Boolean).join(" ");

    const res = await fetch("https://google.serper.dev/maps", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, gl: "za", hl: "en" }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as { places?: SerperPlace[] };
    const place = data.places?.[0];
    if (!place) return null;

    return {
      category:    place.category ?? null,
      address:     place.address ?? null,
      phone:       place.phoneNumber ?? null,
      rating:      typeof place.rating === "number" ? place.rating : null,
      reviewCount: typeof place.ratingCount === "number" ? place.ratingCount : null,
      hours:       parseHours(place.hours),
      website:     place.website ?? null,
    };
  } catch {
    return null;
  }
}
