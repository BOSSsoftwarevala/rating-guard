// Realistic demo dataset for The Rating Guard. All names, reviews and numbers are fictional.
import { classify, ANALYSIS_MODEL, AI_PROVIDER, PROMPT_VERSION } from "./analysis";
import { APP_VERSION } from "./version";

export const SUPER_ADMIN = { id: "6c1f2a9e-3b7d-4e21-9a5c-1f0b2d3e4a5b", email: "theratingguard@gmail.com", password: "manoj6882", name: "Manoj — Super Admin" };

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(6882);
export const seedId = () => "xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(rand() * 16).toString(16));

export const BUSINESS_POOL = [
  { name: "Arsalan Restaurant & Caterer", category: "Biryani restaurant", address: "119A Park Street, Kolkata, West Bengal 700016", rating: 4.3, total: 18432 },
  { name: "Sunrise Multispeciality Dental Clinic", category: "Dental clinic", address: "Salt Lake Sector V, Kolkata, West Bengal 700091", rating: 4.8, total: 612 },
  { name: "Blue Lotus Spa & Wellness", category: "Day spa", address: "Bandra West, Mumbai, Maharashtra 400050", rating: 3.6, total: 389 },
  { name: "Urban Fitness Hub", category: "Gym", address: "HSR Layout, Bengaluru, Karnataka 560102", rating: 4.1, total: 1204 },
  { name: "Green Leaf Organic Café", category: "Café", address: "Koregaon Park, Pune, Maharashtra 411001", rating: 4.6, total: 2210 },
  { name: "Royal Enfield Service — Speed Motors", category: "Motorcycle repair shop", address: "Anna Nagar, Chennai, Tamil Nadu 600040", rating: 3.2, total: 947 },
  { name: "Hotel Grand Heritage", category: "Hotel", address: "MI Road, Jaipur, Rajasthan 302001", rating: 4.0, total: 5320 },
  { name: "Little Steps Montessori", category: "Preschool", address: "Sector 45, Gurugram, Haryana 122003", rating: 4.7, total: 268 },
  { name: "QuickFix Mobile Repair", category: "Mobile phone repair shop", address: "Lajpat Nagar II, New Delhi 110024", rating: 2.9, total: 433 },
  { name: "Saffron Tandoor House", category: "North Indian restaurant", address: "Banjara Hills, Hyderabad, Telangana 500034", rating: 4.4, total: 3876 },
  { name: "Pristine Eye Care Centre", category: "Eye care center", address: "Navrangpura, Ahmedabad, Gujarat 380009", rating: 4.5, total: 721 },
  { name: "CloudNine Coworking", category: "Coworking space", address: "Indiranagar, Bengaluru, Karnataka 560038", rating: 4.2, total: 514 },
];

const AUTHORS = ["Ananya Sen", "Rohit Sharma", "Priya Nair", "Arjun Mehta", "Sneha Iyer", "Vikram Rathore", "Meera Kapoor", "Kunal Banerjee", "Aisha Khan", "Rahul Verma", "Divya Pillai", "Sourav Ghosh", "Neha Joshi", "Aditya Rao", "Pooja Malhotra", "Imran Qureshi", "Kavya Reddy", "Siddharth Das", "Riya Chatterjee", "Manish Gupta", "Tanvi Desai", "Harsh Agarwal", "Ishita Bose", "Farhan Siddiqui"];

const REVIEWS: { rating: number; text: string | null }[] = [
  { rating: 5, text: "Absolutely loved the experience. Staff were polite, everything was clean and on time. Will definitely come back with family." },
  { rating: 5, text: "Best service in the area. They explained everything clearly and the pricing was transparent. Highly recommended!" },
  { rating: 4, text: "Good overall. Waiting time was a bit long on Saturday evening but quality made up for it." },
  { rating: 4, text: "Nice ambience and friendly team. Parking is a little difficult, otherwise great." },
  { rating: 2, text: "Booked for 7pm and was seated at 7:50. The manager apologised but the delay ruined our plan. Food was okay." },
  { rating: 1, text: "Overcharged me for a service I never asked for. When I asked for the bill breakup they were rude. Disappointed." },
  { rating: 3, text: "Average. Nothing special, nothing bad. Prices slightly on the higher side for what you get." },
  { rating: 1, text: "These people are frauds and cheaters!! Shameless staff, total scam. Stay away." },
  { rating: 5, text: "Great place but honestly visit www.cityspadeals.com and use code SAVE40 for a much cheaper option nearby." },
  { rating: 1, text: "I worked at this place for 2 years, management is terrible. Our competitor across the road is far better, go there." },
  { rating: 1, text: "Never been here but my friend said it's horrible. Not going ever." },
  { rating: 1, text: "Contact me on 98300 12345 if you want the real story about the owner and his family." },
  { rating: 2, text: "Bad." },
  { rating: 5, text: null },
  { rating: 1, text: "Watched the cricket match yesterday, India should change the captain. Nothing to do with this shop lol." },
  { rating: 4, text: "Doctor was patient and thorough. Reception could be more organised but treatment was excellent." },
  { rating: 5, text: "Clean, hygienic and professional. They follow up after the visit too — rare these days." },
  { rating: 2, text: "Product quality has dropped compared to last year. Portion sizes are smaller and price went up." },
  { rating: 1, text: "Useless people, idiots at the front desk. Waited 1 hour for nothing." },
  { rating: 3, text: "Service was fine but AC was not working properly in the waiting area. Please fix it." },
];

const RELATIVE = ["a week ago", "2 weeks ago", "3 weeks ago", "a month ago", "2 months ago", "3 days ago", "5 days ago"];
const iso = (daysAgo: number, h = 10) => new Date(Date.now() - daysAgo * 86400000 - h * 3600000).toISOString();

export function makeReviews(scanId: string, mapsUri: string, pick: () => number, createdAt: string) {
  const used = new Set<number>();
  const out = [];
  while (out.length < 5) {
    const i = Math.floor(pick() * REVIEWS.length);
    if (used.has(i)) continue;
    used.add(i);
    const r = REVIEWS[i]!;
    const days = 3 + Math.floor(pick() * 80);
    out.push({
      id: seedId(), scan_id: scanId, author: AUTHORS[Math.floor(pick() * AUTHORS.length)]!, author_uri: null, rating: r.rating,
      published_at: iso(days), relative_time: RELATIVE[Math.floor(pick() * RELATIVE.length)]!, text: r.text,
      review_uri: pick() > 0.25 ? `${mapsUri}&review=${Math.floor(pick() * 1e9)}` : null, processing_status: "STORED",
      content_hash: null, created_at: createdAt, risk: "requires_review", confidence: 0, indicators: [], evidence: null, reason: null, policy_category: null,
    });
  }
  return out;
}

export function healthScore(rating: number | null, reviews: { rating: number }[], an: { risk: string; confidence: number }[]) {
  if (rating == null || !reviews.length) return null;
  const low = reviews.filter((r) => r.rating <= 2).length / reviews.length;
  const flagged = an.filter((a) => a.risk === "high" || a.risk === "medium").length / Math.max(an.length, 1);
  const conf = an.reduce((s, a) => s + a.confidence, 0) / Math.max(an.length, 1) / 100;
  return Math.round(Math.max(0, Math.min(100, (rating / 5) * 60 + (1 - low) * 15 + (1 - flagged) * 15 + conf * 10)));
}

export function buildSeed() {
  const uid = SUPER_ADMIN.id;
  const db: any = {
    scans: [], reviews: [], review_analyses: [], reports: [], businesses: [], scan_events: [], error_events: [], audit_log: [],
    review_actions: [], scan_batches: [], debug_findings: [], profiles: [], site_content: [],
  };
  const batchId = seedId();
  db.scan_batches!.push({ id: batchId, batch_number: 1, total: 4, user_id: uid, created_at: iso(6) });
  db.profiles!.push({ user_id: uid, name: SUPER_ADMIN.name, username: SUPER_ADMIN.email, status: "active", avatar_path: null, created_at: iso(60), updated_at: iso(2) });
  db.site_content!.push({ id: "home", published: {}, draft: {}, published_at: iso(10), updated_at: iso(10) });

  BUSINESS_POOL.forEach((b, idx) => {
    const daysAgo = 28 - idx * 2.3;
    const created = iso(daysAgo, 3 + (idx % 6));
    const done = new Date(new Date(created).getTime() + (38 + idx * 7) * 1000).toISOString();
    const bizId = seedId(), scanId = seedId();
    const placeId = "ChIJ" + seedId().replace(/-/g, "").slice(0, 23);
    const mapsUri = `https://maps.google.com/?cid=${1000000000000 + idx * 7919}`;
    db.businesses!.push({ id: bizId, user_id: uid, place_id: placeId, name: b.name, category: b.category, address: b.address, rating: b.rating, total_reviews: b.total, maps_uri: mapsUri, latitude: null, longitude: null, is_seed: false, created_at: created, updated_at: created });

    const failed = idx === 8;
    const reviews = failed ? [] : makeReviews(scanId, mapsUri, rand, created);
    const analyses = reviews.map((r) => ({ r, a: classify(r.text, r.rating) }));
    const n = (k: string) => analyses.filter((x) => x.a.risk === k).length;
    db.scans!.push({
      id: scanId, user_id: uid, source_url: `https://www.google.com/maps/place/${encodeURIComponent(b.name).replace(/%20/g, "+")}`,
      status: failed ? "failed" : "complete", stage: failed ? "fetch" : "done", data_source: "google_places", batch_id: idx >= 8 ? batchId : null,
      business_id: bizId, place_id: placeId, business_name: b.name, category: b.category, address: b.address, rating: b.rating, total_reviews: b.total,
      maps_uri: mapsUri, reviews_retrieved: reviews.length, api_rating_raw: b.rating, api_total_reviews_raw: b.total,
      high_count: n("high"), medium_count: n("medium"), normal_count: n("normal"), requires_review_count: n("requires_review"),
      error: failed ? "Google Places API rate limit reached. Retry in a few minutes." : null, is_seed: false, rating_mismatch: idx === 5,
      reviews_failed_analysis: 0, data_quality: failed ? "LOW" : reviews.some((r) => !r.review_uri) ? "MEDIUM" : "HIGH",
      data_quality_reasons: failed ? ["No review data available"] : reviews.some((r) => !r.review_uri) ? ["Review links missing"] : ["All checks passed"],
      review_health_score: failed ? null : healthScore(b.rating, reviews, analyses.map((x) => x.a)),
      started_at: created, created_at: created, completed_at: done,
    });
    reviews.forEach((r) => { r.processing_status = "ANALYZED"; db.reviews!.push(r); });
    analyses.forEach(({ r, a }) => {
      db.review_analyses!.push({ id: seedId(), review_id: r.id, scan_id: scanId, ...a, model: ANALYSIS_MODEL, analysis_provider: AI_PROVIDER, analysis_version: APP_VERSION, prompt_version: PROMPT_VERSION, cached: false, content_hash: null, verification: a.risk === "high" ? { verified: true, model: "guard-verify-v2", agreed: true } : null, created_at: done });
      if (a.risk === "high" || a.risk === "medium") {
        const statuses = ["GOOGLE_REPORTING_PATH_AVAILABLE", "ACTION_RECOMMENDED", "USER_ACTION_PENDING", "RESOLVED", "REVIEWED"];
        db.review_actions!.push({ id: seedId(), review_id: r.id, scan_id: scanId, user_id: uid, status: r.review_uri ? statuses[Math.floor(rand() * statuses.length)] : "ACTION_RECOMMENDED", note: null, created_at: done, updated_at: done });
      }
    });
    const stages = failed ? ["CREATED", "PROCESSING", "FAILED"] : ["CREATED", "PROCESSING", "BUSINESS_RESOLVED", "RATING_RETRIEVED", "REVIEWS_RETRIEVED", "REVIEWS_ANALYZING", "ANALYSIS_COMPLETED", "REPORT_GENERATING", "REPORT_READY"];
    stages.forEach((s, i) => db.scan_events!.push({ id: seedId(), scan_id: scanId, user_id: uid, stage: s, status: s === "FAILED" ? "error" : "ok", message: s === "RATING_RETRIEVED" ? `Rating ${b.rating} from ${b.total} Google reviews` : s === "REVIEWS_RETRIEVED" ? "5 available review(s) retrieved and stored" : s === "FAILED" ? "Rate limit reached" : null, duration_ms: 300 + Math.floor(rand() * 4200), error_code: s === "FAILED" ? "RATE_LIMIT" : null, created_at: new Date(new Date(created).getTime() + i * 4000).toISOString() }));
    if (failed) {
      db.error_events!.push({ id: seedId(), user_id: uid, module: "google", route: "scan", scan_id: scanId, business: b.name, code: "RATE_LIMIT", message: "Google Places API rate limit reached", severity: "MEDIUM", status: "INVESTIGATING", resolution: null, created_at: done });
    } else {
      const high = n("high"), med = n("medium");
      db.reports!.push({ id: seedId(), scan_id: scanId, user_id: uid, report_number: "RG-" + scanId.replace(/-/g, "").slice(0, 8).toUpperCase(), status: "ready", is_seed: false,
        recommended_action: high + med > 0 ? `Review the ${high + med} flagged review(s) and, where you believe Google policy is violated, report each one through the official Google reporting path with the evidence below.` : "No potentially risky reviews detected among the available reviews. No reporting action recommended.",
        summary: `${reviews.length} available review(s) analyzed: ${high} high, ${med} medium, ${n("normal")} normal, ${n("requires_review")} requires review.`,
        high_risk_count: high, medium_risk_count: med, normal_count: n("normal"), report_data: { business: b.name, rating: b.rating }, created_at: done });
    }
    db.audit_log!.push({ id: seedId(), user_id: uid, action: failed ? "scan.failed" : "scan.completed", detail: { scan_id: scanId }, resource: "scan", resource_id: scanId, result: failed ? "failure" : "success", created_at: done });
  });
  db.error_events!.push(
    { id: seedId(), user_id: uid, module: "ai", route: "scan", scan_id: null, business: "Hotel Grand Heritage", code: "AI_UNAVAILABLE", message: "Analysis service timed out after 30s", severity: "HIGH", status: "FIXED", resolution: "Retry with backoff added", created_at: iso(12) },
    { id: seedId(), user_id: uid, module: "google", route: "scan", scan_id: null, business: null, code: "INVALID_URL", message: "Link was not a Google Maps URL", severity: "LOW", status: "VERIFIED", resolution: "User re-entered the correct link", created_at: iso(20) },
  );
  db.debug_findings!.push(
    { id: seedId(), finding_code: "RG-001", module: "scan", severity: "HIGH", status: "VERIFIED", description: "Scans could stay 'running' forever if the worker stopped.", expected: "Stale scans marked failed", actual: "Stuck running", fix: "15-minute sweep", component: "scan-core", route: "/scan", reproduction: null, root_cause: "No timeout", verification: "Sweep verified", created_at: iso(25), updated_at: iso(18) },
    { id: seedId(), finding_code: "RG-002", module: "reports", severity: "MEDIUM", status: "VERIFIED", description: "Report numbers were not unique across tenants.", expected: "Unique number", actual: "Possible duplicate", fix: "Prefix + scan id", component: "reports", route: "/reports", reproduction: null, root_cause: null, verification: "Checked", created_at: iso(22), updated_at: iso(15) },
    { id: seedId(), finding_code: "RG-003", module: "google", severity: "MEDIUM", status: "OPEN", description: "Short maps.app.goo.gl links occasionally resolve slowly.", expected: "< 2s resolve", actual: "Up to 6s", fix: null, component: "places", route: "/scan", reproduction: "Paste a short link", root_cause: "Redirect chain", verification: null, created_at: iso(5), updated_at: iso(5) },
  );
  ["auth.login", "settings.profile_updated", "report.downloaded", "batch.started"].forEach((a, i) =>
    db.audit_log!.push({ id: seedId(), user_id: uid, action: a, detail: {}, resource: a.split(".")[0], resource_id: null, result: "success", created_at: iso(i + 0.5) }));
  return db;
}
