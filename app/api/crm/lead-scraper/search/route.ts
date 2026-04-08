import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../../lib/crm/http";

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";

type PlaceResult = {
  placeId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  website: string | null;
  fbHandle: string | null;
  igHandle: string | null;
  category: string | null;
  adsRunning: boolean | null;
  adLibraryUrl: string | null;
  adSpend: "Low" | "Medium" | "High" | null;
  yearsInBusiness: number | null;
  ownerName: string | null;
  isDuplicate: boolean;
};

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  if (!PLACES_API_KEY) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${PLACES_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  const geo = json.results?.[0]?.geometry?.location;
  return geo ?? null;
}

async function searchPlaces(query: string, lat: number, lng: number, radius: number, maxResults: number): Promise<PlaceResult[]> {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius,
      },
    },
    maxResultCount: Math.min(maxResults, 20),
    languageCode: "en",
  };

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Places API error");

  const places = json.places ?? [];
  return places.map((p: any): PlaceResult => ({
    placeId: p.id ?? "",
    name: p.displayName?.text ?? "Unknown",
    phone: p.nationalPhoneNumber ?? null,
    email: null,
    address: p.formattedAddress ?? "—",
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    website: p.websiteUri ?? null,
    fbHandle: null,
    igHandle: null,
    category: p.primaryTypeDisplayName?.text ?? null,
    adsRunning: null,
    adLibraryUrl: null,
    adSpend: null,
    yearsInBusiness: null,
    ownerName: null,
    isDuplicate: false,
  }));
}

async function checkDuplicates(db: any, placeIds: string[]): Promise<Set<string>> {
  if (!placeIds.length) return new Set();
  try {
    const rows = await db`
      select place_id from public.clients
      where place_id = any(${placeIds}::text[])
    `;
    return new Set(rows.map((r: any) => r.place_id));
  } catch {
    return new Set();
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { query, location = "Pretoria", radius = 20000, maxResults = 25 } = body as {
    query?: string;
    location?: string;
    radius?: number;
    maxResults?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ ok: false, error: "Search query is required" }, { status: 400 });
  }

  if (!PLACES_API_KEY) {
    // Return realistic demo data when no API key is configured
    const demoResults = generateDemoResults(query, location, maxResults);
    return NextResponse.json({ ok: true, results: demoResults, demo: true });
  }

  return withCrmHandler(async (db) => {
    const geo = await geocodeLocation(location);
    const lat = geo?.lat ?? -25.7461; // Pretoria default
    const lng = geo?.lng ?? 28.1881;

    const results = await searchPlaces(query, lat, lng, radius, maxResults);
    const placeIds = results.map((r) => r.placeId).filter(Boolean);
    const duplicates = await checkDuplicates(db, placeIds);

    const final = results.map((r) => ({
      ...r,
      isDuplicate: duplicates.has(r.placeId),
    }));

    return NextResponse.json({ ok: true, results: final });
  });
}

const FIRST_NAMES = ["John","Sarah","Mike","Lisa","David","Priya","Thabo","Zanele","Pieter","Nomsa","Ravi","Aisha","Willem","Lerato","Craig"];
const LAST_NAMES  = ["Smith","Nkosi","van der Berg","Patel","Dlamini","Johnson","Botha","Mokoena","Steyn","Pillay","Williams","Zulu","Fourie","Singh","Ndlovu"];
const CATEGORIES  = ["Plumber","Dentist","Hair Salon","Chiropractor","Electrician","Aesthetic Clinic","Financial Advisor","Estate Agent","Restaurant","Gym","Mechanic","Physiotherapist"];
const SPEND_OPTS: Array<"Low"|"Medium"|"High"> = ["Low","Medium","High"];

function generateDemoResults(query: string, location: string, max: number): PlaceResult[] {
  const keyword = query.split(" ")[0] ?? "Business";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const names = [
    `${cap(keyword)} Pro ${location}`, `${location} ${cap(keyword)} Specialists`,
    `Elite ${cap(keyword)} Services`, `${cap(keyword)} Masters SA`,
    `Premier ${cap(keyword)} ${location}`, `Top ${cap(keyword)} Group`,
    `${cap(keyword)} Hub`, `${location} ${cap(keyword)} Co`,
    `The ${cap(keyword)} Centre`, `${cap(keyword)} Express`,
    `Quality ${cap(keyword)} Solutions`, `${cap(keyword)} Direct`,
    `${location} ${cap(keyword)} Works`, `First Choice ${cap(keyword)}`,
    `${cap(keyword)} Plus SA`, `Expert ${cap(keyword)} Services`,
    `${cap(keyword)} Point`, `${location} ${cap(keyword)} Pros`,
    `A-Grade ${cap(keyword)}`, `${cap(keyword)} Clinic ${location}`,
    `${cap(keyword)} World`, `Super ${cap(keyword)} SA`,
    `${cap(keyword)} Connect`, `${location} ${cap(keyword)} Studio`,
    `Pro ${cap(keyword)} Works`,
  ];
  const streets = ["Church St","Pretorius St","Paul Kruger St","Voortrekker Rd","Jorissen St","Arcadia St","Festival St","Beatrix St"];

  return names.slice(0, max).map((name, i) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const hasWebsite = Math.random() > 0.3;
    const hasAds = Math.random() > 0.5;
    const hasFb = Math.random() > 0.4;
    const hasIg = Math.random() > 0.45;
    const hasEmail = Math.random() > 0.35;
    const adsRunning = hasAds ? Math.random() > 0.45 : false;
    const owner = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    const cat = CATEGORIES[i % CATEGORIES.length];

    return {
      placeId: `demo-${i}-${Date.now()}`,
      name,
      phone: `+27 ${Math.floor(10 + Math.random() * 79)} ${Math.floor(100 + Math.random() * 900)} ${Math.floor(1000 + Math.random() * 9000)}`,
      email: hasEmail ? `info@${slug}.co.za` : null,
      address: `${Math.floor(1 + Math.random() * 200)} ${streets[i % streets.length]}, ${location}`,
      rating: Math.random() > 0.12 ? Math.round((3.0 + Math.random() * 2.0) * 10) / 10 : null,
      ratingCount: Math.random() > 0.12 ? Math.floor(5 + Math.random() * 480) : null,
      website: hasWebsite ? `https://www.${slug}.co.za` : null,
      fbHandle: hasFb ? slug.slice(0, 15) : null,
      igHandle: hasIg ? `${slug.slice(0, 12)}_sa` : null,
      category: cat,
      adsRunning,
      adLibraryUrl: adsRunning ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&q=${encodeURIComponent(name)}` : null,
      adSpend: adsRunning ? SPEND_OPTS[Math.floor(Math.random() * 3)] : null,
      yearsInBusiness: Math.random() > 0.25 ? Math.floor(1 + Math.random() * 22) : null,
      ownerName: Math.random() > 0.4 ? owner : null,
      isDuplicate: false,
    };
  });
}
