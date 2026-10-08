// Demo scan pipeline — simulates Google business lookup and review analysis with realistic data.
import { classify, ANALYSIS_MODEL } from "./analysis";
import { BUSINESS_POOL, makeReviews, healthScore } from "./seed";

export type StageResponse = { ok: true; scanId: string; reviews: number } | { ok: false; code: string; message: string; scanId?: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function audit(supabase: any, userId: string, action: string, detail: Record<string, unknown>, result: "success" | "failure" = "success") {
  const resource_id = (detail["scan_id"] ?? detail["batch_id"] ?? null) as string | null;
  await supabase.from("audit_log").insert({ user_id: userId, action, detail, resource: action.split(".")[0], resource_id, result });
}
async function track(supabase: any, userId: string, scanId: string, stage: string, t: number, message?: string) {
  await supabase.from("scan_events").insert({ scan_id: scanId, user_id: userId, stage, status: "ok", message: message ?? null, duration_ms: Date.now() - t, error_code: null });
}

export function validGoogleUrl(raw: string) {
  try {
    const u = new URL(raw);
    return /(^|\.)google\.[a-z.]+$/.test(u.hostname) || /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co)$/.test(u.hostname);
  } catch { return false; }
}

function nameFromUrl(url: string) {
  const m = url.match(/\/place\/([^/@?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]!.replace(/\+/g, " ")).trim() || null; } catch { return null; }
}

export async function scanFetchCore(supabase: any, userId: string, data: { url: string; batchId?: string }): Promise<StageResponse> {
  if (!validGoogleUrl(data.url)) return { ok: false, code: "INVALID_URL", message: "This isn't a Google Maps or Business link. Paste a link like google.com/maps/place/… or maps.app.goo.gl/…" };
  const t0 = Date.now();
  const { data: scan } = await supabase.from("scans").insert({
    user_id: userId, source_url: data.url, status: "running", stage: "fetch", data_source: "google_places", batch_id: data.batchId ?? null,
    high_count: 0, medium_count: 0, normal_count: 0, requires_review_count: 0, reviews_retrieved: 0, reviews_failed_analysis: 0, rating_mismatch: false,
    is_seed: false, data_quality_reasons: [], started_at: new Date().toISOString(),
  }).select("id").single();
  await track(supabase, userId, scan.id, "CREATED", t0);
  await audit(supabase, userId, "scan.started", { scan_id: scan.id, url: data.url });
  await wait(900);
  let seed = [...data.url].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const pick = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const base = BUSINESS_POOL[Math.floor(pick() * BUSINESS_POOL.length)]!;
  const name = nameFromUrl(data.url) ?? base.name;
  const rating = Math.round((3 + pick() * 2) * 10) / 10;
  const total = 80 + Math.floor(pick() * 4000);
  const mapsUri = `https://maps.google.com/?cid=${Math.floor(pick() * 1e15)}`;
  const { data: biz } = await supabase.from("businesses").insert({ user_id: userId, name, category: base.category, address: base.address, rating, total_reviews: total, maps_uri: mapsUri, is_seed: false }).select("id").single();
  await track(supabase, userId, scan.id, "BUSINESS_RESOLVED", t0, name);
  await track(supabase, userId, scan.id, "RATING_RETRIEVED", t0, `Rating ${rating} from ${total} Google reviews`);
  const reviews = makeReviews(scan.id, mapsUri, pick, new Date().toISOString());
  await supabase.from("reviews").insert(reviews);
  await track(supabase, userId, scan.id, "REVIEWS_RETRIEVED", t0, `${reviews.length} available review(s) retrieved and stored`);
  await supabase.from("scans").update({ business_id: biz.id, business_name: name, category: base.category, address: base.address, rating, total_reviews: total, maps_uri: mapsUri, reviews_retrieved: reviews.length, api_rating_raw: rating, api_total_reviews_raw: total, stage: "analyze" }).eq("id", scan.id);
  return { ok: true, scanId: scan.id, reviews: reviews.length };
}

export async function scanAnalyzeCore(supabase: any, userId: string, data: { scanId: string }): Promise<StageResponse> {
  const t0 = Date.now();
  const { data: scan } = await supabase.from("scans").select("*").eq("id", data.scanId).maybeSingle();
  if (!scan) return { ok: false, code: "NOT_FOUND", message: "Scan not found." };
  if (scan.status === "complete") return { ok: true, scanId: scan.id, reviews: scan.reviews_retrieved };
  const { data: reviews } = await supabase.from("reviews").select("*").eq("scan_id", scan.id);
  await track(supabase, userId, scan.id, "REVIEWS_ANALYZING", t0, `${reviews.length} review(s)`);
  await wait(1100);
  const res = reviews.map((r: any) => ({ r, a: classify(r.text, r.rating) }));
  await supabase.from("review_analyses").insert(res.map(({ r, a }: any) => ({ review_id: r.id, scan_id: scan.id, ...a, model: ANALYSIS_MODEL, cached: false, verification: null })));
  await supabase.from("reviews").update({ processing_status: "ANALYZED" }).eq("scan_id", scan.id);
  await track(supabase, userId, scan.id, "ANALYSIS_COMPLETED", t0);
  const n = (k: string) => res.filter((x: any) => x.a.risk === k).length;
  const high = n("high"), medium = n("medium");
  await supabase.from("reports").insert({
    scan_id: scan.id, user_id: userId, report_number: "RG-" + scan.id.replace(/-/g, "").slice(0, 8).toUpperCase(), status: "ready", is_seed: false,
    recommended_action: high + medium > 0 ? `Review the ${high + medium} flagged review(s) and, where you believe Google policy is violated, report each one through the official Google reporting path with the evidence below.` : "No potentially risky reviews detected among the available reviews. No reporting action recommended.",
    summary: `${reviews.length} available review(s) analyzed: ${high} high, ${medium} medium, ${n("normal")} normal, ${n("requires_review")} requires review.`,
    high_risk_count: high, medium_risk_count: medium, normal_count: n("normal"), report_data: {},
  });
  const flagged = res.filter((x: any) => x.a.risk === "high" || x.a.risk === "medium");
  if (flagged.length) await supabase.from("review_actions").upsert(flagged.map((f: any) => ({ review_id: f.r.id, scan_id: scan.id, user_id: userId, status: f.r.review_uri ? "GOOGLE_REPORTING_PATH_AVAILABLE" : "ACTION_RECOMMENDED", note: null })), { onConflict: "review_id", ignoreDuplicates: true });
  const missing = reviews.some((r: any) => !r.review_uri);
  await supabase.from("scans").update({
    status: "complete", stage: "done", high_count: high, medium_count: medium, normal_count: n("normal"), requires_review_count: n("requires_review"),
    completed_at: new Date().toISOString(), review_health_score: healthScore(Number(scan.rating), reviews, res.map((x: any) => x.a)),
    data_quality: missing ? "MEDIUM" : "HIGH", data_quality_reasons: missing ? ["Review links missing"] : ["All checks passed"],
  }).eq("id", scan.id);
  await track(supabase, userId, scan.id, "REPORT_READY", t0);
  await audit(supabase, userId, "scan.completed", { scan_id: scan.id, high, medium });
  return { ok: true, scanId: scan.id, reviews: reviews.length };
}
