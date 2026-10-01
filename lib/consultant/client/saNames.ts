/**
 * Curated South African names for speech-to-text correction (pure data).
 *
 * Browser speech engines are trained mostly on US/UK English, so South African
 * names come back mis-spelt ("tandeka" for Thandeka), split ("nkosi nathi"),
 * or merged ("vandermerwe"). `normaliseSpokenName` (speech.ts) uses this table
 * to restore the canonical spelling and casing.
 *
 * How to extend (Cursor / Antigravity friendly):
 * - Add the canonical spelling to the right list. Word-spacing mistakes are
 *   fixed automatically (the matcher compares names with spaces and hyphens
 *   removed), so "nkosi nathi" needs no entry.
 * - Add to `misheard` only phonetic mistakes you have actually seen, and never
 *   a spelling that is itself a real name (e.g. "Refiloe" is not a typo of
 *   "Refilwe"; "Dhlamini" and "Pillai" are legitimate family spellings, so they
 *   are NOT listed as mistakes).
 * - Surname particles (van, der, du, de, le, janse) are written as in the
 *   canonical form with the particle lower-case ("van der Merwe"). The
 *   normaliser capitalises the first particle when the surname stands alone
 *   ("Van der Merwe"), per South African usage.
 *
 * Not personal data: these are common public names, no individuals.
 */

export type SaNameOrigin =
  | "afrikaans"
  | "english"
  | "cape" // Cape / Western Cape heritage names (e.g. April, Februarie)
  | "zulu"
  | "xhosa"
  | "nguni" // shared Zulu / Xhosa / Ndebele / Swati
  | "sotho"
  | "tswana"
  | "pedi"
  | "tsonga"
  | "venda"
  | "indian"; // Indian South African (Tamil, Telugu, Hindi, Gujarati, Muslim)

export type SaNameEntry = {
  canonical: string;
  kind: "first" | "surname";
  origin: SaNameOrigin;
  /** Lower-case phonetic mis-hearings seen from STT engines. */
  misheard?: string[];
};

const first = (origin: SaNameOrigin, names: (string | [string, string[]])[]): SaNameEntry[] =>
  names.map((n) => (Array.isArray(n) ? { canonical: n[0], kind: "first", origin, misheard: n[1] } : { canonical: n, kind: "first", origin }));

const surname = (origin: SaNameOrigin, names: (string | [string, string[]])[]): SaNameEntry[] =>
  names.map((n) => (Array.isArray(n) ? { canonical: n[0], kind: "surname", origin, misheard: n[1] } : { canonical: n, kind: "surname", origin }));

export const SA_NAMES: SaNameEntry[] = [
  // ── First names: Nguni (Zulu / Xhosa / Ndebele / Swati) ──────────────────
  ...first("nguni", [
    ["Nkosinathi", ["kosinathi", "nkosinati", "kosinati", "enkosinathi"]],
    ["Thandeka", ["tandeka", "tandika", "thandika", "tandecka"]],
    ["Mbali", ["mbaali", "embali"]],
    ["Sipho", ["seepo", "cipho", "sepo", "seepho", "see po"]],
    ["Zanele", ["zanelle", "zanelli", "zanellie"]],
    ["Nomvula", ["nomvoola"]],
    ["Lindiwe", ["lindiwey", "lindy we", "lindywe"]],
    ["Sibusiso", ["sibusizo", "see boo see so", "sibuseso"]],
    ["Themba", ["temba"]],
    "Bongani",
    ["Nokuthula", ["nokutula"]],
    "Siyabonga",
    "Sandile",
    ["Sifiso", ["sifeeso"]],
    ["Thulani", ["tulani"]],
    "Mandla",
    "Nomsa",
    "Zodwa",
    "Busisiwe",
    "Ayanda",
    "Andile",
    ["Lwazi", ["luazi", "lwasi", "la wazi"]],
    ["Luthando", ["lutando"]],
    "Nandi",
    "Nosipho",
    "Zinhle",
    "Khanyisile",
    "Nompumelelo",
    "Phindile",
    ["Thandiwe", ["tandiwe"]],
    "Xolani",
    ["Mthunzi", ["mtunzi", "emtunzi", "m tunzi"]],
    "Lungile",
    "Nothando",
    "Nolwazi",
    "Sizwe",
    "Anele",
    "Asanda",
    "Siphesihle",
    "Njabulo",
    "Khaya",
    "Unathi",
    "Yonela",
    "Babalwa",
    "Noluthando",
    "Vuyo",
    "Vuyiswa",
    "Lindokuhle",
    "Nonhlanhla",
    "Sbusiso",
    "Musa",
    "Sanele",
    "Nhlanhla",
  ]),

  // ── First names: Sotho / Tswana / Pedi ────────────────────────────────────
  ...first("sotho", [
    ["Lerato", ["lorato", "lerado", "larato"]],
    ["Thabo", ["tabo", "tarbo"]],
    ["Palesa", ["palisa", "pallesa"]],
    ["Mpho", ["empo", "m po", "mpo"]],
    ["Tshepo", ["chepo", "tshepho", "shepo", "tsepo"]],
    "Neo",
    "Lesedi",
    ["Tumelo", ["too melo", "tumello"]],
    "Dineo",
    ["Boitumelo", ["boy tumelo", "boitumello"]],
    ["Teboho", ["teboo"]],
    "Puleng",
    "Relebohile",
    "Lehlohonolo",
    "Itumeleng",
    "Motlatsi",
    "Nthabiseng",
    "Mosa",
    "Rethabile",
    "Mamello",
  ]),
  ...first("tswana", [
    ["Kagiso", ["kagisho", "kahiso"]],
    ["Karabo", ["carabo", "karabow"]],
    ["Katlego", ["cutlego", "katlago", "catlego"]],
    "Kamogelo",
    ["Lebogang", ["lebogan"]],
    "Refilwe",
    "Keabetswe",
    "Reabetswe",
    "Tshegofatso",
    "Kgomotso",
    "Masego",
    "Oratile",
    "Onalenna",
    "Omphile",
    "Tebogo",
    "Mmabatho",
    "Gaone",
  ]),
  ...first("pedi", ["Mahlatse", "Lesiba", "Mmathapelo", "Tlou", "Lethabo", "Kgothatso"]),
  ...first("tsonga", ["Hlulani", "Tsakani", "Nhlamulo", "Ntsako", "Tiyani", "Rhulani"]),
  ...first("venda", ["Rudzani", "Mashudu", "Tshilidzi", "Livhuwani", "Ndivhuwo", "Mpfariseni"]),

  // ── First names: Afrikaans ────────────────────────────────────────────────
  ...first("afrikaans", [
    "Pieter",
    ["Johannes", ["yohannes", "johannis", "johanness"]],
    ["Johan", ["yohan"]],
    ["Jacobus", ["yacobus", "jakobus"]],
    "Hendrik",
    "Gerhard",
    "Francois",
    "Andries",
    "Christo",
    "Riaan",
    "Wynand",
    "Hennie",
    "Marius",
    "Carel",
    "Frikkie",
    "Werner",
    "Ruan",
    "Dewald",
    "Heinrich",
    "Jaco",
    "Ettienne",
    "Danie",
    "Schalk",
    "Anneke",
    "Annelie",
    "Marelize",
    "Elmarie",
    "Liezel",
    "Riana",
    "Mariska",
    "Charné",
    "Anél",
    "Carien",
    "Ilze",
    "Elsabé",
    "Marietjie",
    "Sanet",
    "Zelda",
  ]),

  // ── First names: Indian South African ─────────────────────────────────────
  ...first("indian", [
    "Priya",
    "Kavitha",
    "Anusha",
    "Deshnee",
    "Kershnee",
    "Nerisha",
    "Rajesh",
    "Pravesh",
    "Kumaran",
    "Suren",
    "Nivesh",
    "Kreesan",
    "Yugen",
    "Preshen",
    "Vishal",
    "Dhiren",
    "Ashwin",
    "Rakesh",
    "Sanjay",
    "Yusuf",
    "Fatima",
    "Ayesha",
    "Zaheer",
    "Faizel",
    "Riaz",
  ]),

  // ── First names: English / Cape (only ones STT tends to mangle) ───────────
  ...first("english", ["Chantelle", "Candice", "Charlene", "Deon", "Shaun", "Cheslyn", "Jolene", "Lynette", "Ruwayda", "Tasneem"]),

  // ── Surnames: Afrikaans (incl. particles) ─────────────────────────────────
  ...surname("afrikaans", [
    ["van der Merwe", ["van de merwe", "fun der merwe", "van der mirwe", "vandamerwe", "van da merwe"]],
    ["Botha", ["bota", "bortha"]],
    "Pretorius",
    ["Venter", ["fenter"]],
    "Nel",
    ["Steyn", ["stain", "stine"]],
    ["du Plessis", ["du plessey", "do plessis", "du plesis", "due plessis", "du plessy"]],
    ["van Wyk", ["van wake", "fun wyk", "van vyk"]],
    ["Coetzee", ["coot see", "kutsee", "cootzee", "coetsee", "kotzee"]],
    ["Fourie", ["foorie", "fouri"]],
    "Kruger",
    "Smit",
    ["Swanepoel", ["swan a pool", "swanepool", "swanipoel", "swanapoel"]],
    ["Oosthuizen", ["oost hazen", "oosthuysen", "oosthuisen", "oost haysen"]],
    ["Potgieter", ["potgeter"]],
    ["Viljoen", ["filjoen", "fil yoon", "viljoon"]],
    "Visser",
    ["de Villiers", ["de villers", "the villiers", "de villiars"]],
    ["Joubert", ["jobert", "joubear"]],
    "Erasmus",
    "Engelbrecht",
    ["Marais", ["marray", "ma ray", "marrais"]],
    "Meyer",
    ["du Toit", ["du toy", "do toy", "due toit", "du toi"]],
    "Olivier",
    "Snyman",
    ["Cronje", ["cronye", "kronye", "cron yay"]],
    "Bezuidenhout",
    ["le Roux", ["le roo", "la roux", "le ru"]],
    ["van Zyl", ["van zile", "fun zyl", "van zail"]],
    ["Janse van Rensburg", ["jansen van rensburg", "yansa van rensburg", "janse van rensberg"]],
    "van Rensburg",
    "van Niekerk",
    "van den Berg",
    ["Vermeulen", ["fermeulen", "ver mullen", "vermeulin"]],
    "Grobler",
    "Mostert",
    ["Labuschagne", ["labuschane", "laboo shane", "labushagne", "la bush anya", "labuscagne"]],
    ["Terblanche", ["terblanch", "terblance"]],
    ["Pienaar", ["pinaar", "peenaar", "pienar"]],
    "Hattingh",
    "Muller",
    "Lombard",
    ["Rossouw", ["rossow", "ross ow", "rosso"]],
    "Scholtz",
    "Badenhorst",
    "Wessels",
    ["Myburgh", ["myburg", "may burg", "mayburgh"]],
    "Strydom",
    "Theron",
    "Liebenberg",
    ["Nortje", ["nortye", "nortier", "nor chay"]],
    "Barnard",
    "Burger",
    "Geldenhuys",
    "de Beer",
    "de Wet",
    "du Preez",
    "le Grange",
    "de Klerk",
    "van Heerden",
    "van Tonder",
    "van Staden",
  ]),

  // ── Surnames: Nguni (Zulu / Xhosa / Ndebele / Swati) ──────────────────────
  ...surname("nguni", [
    ["Dlamini", ["lamini", "the lamini", "dlamani", "dalamini"]],
    ["Nkosi", ["nkozi", "enkosi", "in kosi"]],
    ["Ndlovu", ["endlovu", "in dlovu", "ndlovoo", "dlovu"]],
    "Zulu",
    ["Mkhize", ["mkize", "m keezy", "em kize", "mkeezy"]],
    ["Ngcobo", ["ncobo", "n cobo", "ngobo", "gcobo"]],
    ["Khumalo", ["kumalo", "khumallo", "coomalo", "kumallo"]],
    ["Mthembu", ["mtembu", "em tembu"]],
    "Buthelezi",
    "Zungu",
    "Shabalala",
    "Cele",
    "Mahlangu",
    "Ntuli",
    "Hlongwane",
    "Gumede",
    ["Mthethwa", ["mtetwa", "mthetwa", "em tetwa"]],
    "Sithole",
    "Nxumalo",
    "Msimang",
    "Mabaso",
    "Ngubane",
    "Mhlongo",
    "Majola",
    "Luthuli",
    "Mtshali",
    "Mabuza",
    "Radebe",
    "Khoza",
    "Masondo",
    "Zwane",
    "Shezi",
    "Sibiya",
    "Magagula",
  ]),
  ...surname("xhosa", ["Sisulu", "Mbeki", "Hani", "Makeba", "Ngcukana", "Mda", "Nkwinti", "Madikizela", "Mqhayi", "Tshwete", "Mxenge", "Mandela", "Qwabe"]),

  // ── Surnames: Sotho / Tswana / Pedi / Tsonga / Venda ──────────────────────
  ...surname("sotho", [
    ["Mokoena", ["mokwena", "mokuena", "moquena"]],
    ["Mofokeng", ["mofokang"]],
    "Moloi",
    "Motaung",
    "Tshabalala",
    "Masilo",
    "Motsoeneng",
    "Nhlapo",
    "Mokhele",
  ]),
  ...surname("tswana", [
    ["Molefe", ["molefi"]],
    "Modise",
    "Motsepe",
    "Tau",
    "Kgosana",
    "Mashaba",
    "Moagi",
    "Mothibi",
    "Seakamela",
    "Sebego",
  ]),
  ...surname("pedi", ["Letsoalo", "Makgoba", "Sebola", "Masemola", "Mohlala", "Mphahlele", "Ramokgopa", "Maponya", "Lekganyane"]),
  ...surname("tsonga", [
    ["Maluleke", ["malulake", "malooleke", "maluleki"]],
    ["Baloyi", ["baloi", "balloyi"]],
    ["Mathebula", ["matebula", "mathabula"]],
    "Nkuna",
    ["Chauke", ["chawke", "chaukey"]],
    "Shabangu",
    "Mabunda",
    "Ngobeni",
    "Hlungwani",
  ]),
  ...surname("venda", ["Mudau", "Ramaphosa", "Netshitenzhe", "Tshivhase", "Nemavhola", "Mukwevho", "Ramabulana", "Nethengwe"]),

  // ── Surnames: Indian South African ────────────────────────────────────────
  ...surname("indian", [
    ["Naidoo", ["naidu", "nydoo", "naido", "nydu"]],
    ["Pillay", ["pilay", "pillae", "pee lay"]],
    ["Govender", ["govinder", "govendor", "govenda"]],
    ["Moodley", ["moodly", "mudley", "moodli"]],
    "Reddy",
    ["Chetty", ["chetti", "chetey"]],
    ["Padayachee", ["padayachi", "pada yachi", "padiachee", "padayache"]],
    "Maharaj",
    "Singh",
    ["Naicker", ["nyker", "naiker"]],
    "Moonsamy",
    "Ramsamy",
    "Munsamy",
    "Pather",
    "Rajah",
    "Ramdass",
    "Sewpersad",
    "Bhana",
    "Patel",
    "Desai",
    "Moosa",
    "Essop",
    "Cassim",
    "Khan",
    "Mahomed",
    "Ebrahim",
    "Dawood",
  ]),

  // ── Surnames: English / Cape ──────────────────────────────────────────────
  ...surname("cape", [
    "Daniels",
    "Isaacs",
    "Hendricks",
    "Abrahams",
    "Petersen",
    "Arendse",
    "Februarie",
    "Davids",
    "Solomons",
    "Cupido",
    "Fortuin",
    "Klaasen",
    "Julies",
    "Booysen",
    "Adonis",
    "Jacobs",
    "Adams",
  ]),
];

/** Lower-case words that are surname particles (kept lower-case mid-name). */
export const SA_NAME_PARTICLES = new Set(["van", "der", "den", "de", "du", "le", "la", "von", "janse", "jansen", "te", "ten"]);

/** Spoken honorifics → the SA written form (no full stop, per SA/UK style). */
export const SA_HONORIFICS: Record<string, string> = {
  doctor: "Dr",
  dr: "Dr",
  mister: "Mr",
  mr: "Mr",
  missus: "Mrs",
  misses: "Mrs",
  mrs: "Mrs",
  ms: "Ms",
  miss: "Miss",
  professor: "Prof",
  prof: "Prof",
};
