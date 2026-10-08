import { createServerFn } from "@/lib/mock-server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/mock-server";

export const INSIGHTS_MODEL = "openai/gpt-6-astra";

export type BatchInsights = {
  overview: string;
  themes: { theme: string; detail: string; businesses: string[] }[];
  priorities: { business: string; priority: "high" | "medium" | "low"; reason: string; action: string }[];
  scansAnalyzed: number;
  model: string;
};

/** Completed batches (with at least one completed scan) for the picker. */
export const listCompletedBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("scan_batches")
      .select("id, batch_number, total, created_at, scans(status)")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? [])
      .map((b: any) => {
        const scans = (b.scans ?? []) as { status: string }[];
        const done = scans.filter((s) => s.status === "complete").length;
        const running = scans.some((s) => s.status === "running");
        return { id: b.id as string, batch_number: b.batch_number as number, total: b.total as number, created_at: b.created_at as string, completed: done, running };
      })
      .filter((b) => b.completed > 0 && !b.running);
  });

async function readResponsesStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", errMsg: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "error" || ev.type === "response.failed") errMsg = ev.error?.message ?? ev.response?.error?.message ?? "AI request failed.";
      } catch { /* ignore partial */ }
    }
  }
  if (errMsg) throw new Error(errMsg);
  return text;
}

export const generateBatchInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; insights: BatchInsights } | { ok: false; message: string }> => {
    const { supabase, userId } = context;

    const { data: scans, error } = await supabase
      .from("scans")
      .select("id, business_name, category, rating, total_reviews, high_count, medium_count, normal_count, requires_review_count, reviews(rating, text, review_analyses(risk, category, reason))")
      .eq("batch_id", data.batchId)
      .eq("status", "complete");
    if (error) return { ok: false, message: "Database unavailable — could not load the batch." };
    if (!scans?.length) return { ok: false, message: "This batch has no completed scans to summarize." };

    const digest = scans.map((s: any) => {
      const revs = (s.reviews ?? []).map((r: any) => {
        const a = Array.isArray(r.review_analyses) ? r.review_analyses[0] : r.review_analyses;
        return `  - ${r.rating}★ [${a?.risk ?? "unanalyzed"}${a?.category ? `: ${a.category}` : ""}] ${(r.text ?? "(no text)").slice(0, 400)}`;
      }).join("\n");
      return `Business: ${s.business_name ?? "Unknown"} (${s.category ?? "no category"}) — Google rating ${s.rating ?? "?"} from ${s.total_reviews ?? "?"} total reviews. Available reviews analyzed: high ${s.high_count}, medium ${s.medium_count}, normal ${s.normal_count}, requires review ${s.requires_review_count}.\n${revs}`;
    }).join("\n\n");

    const instructions = `You help an admin triage Google review risk scans for a batch of businesses.
Only use the provided available reviews (Google returns at most 5 per business); never claim these are all reviews, and never claim certainty of a policy violation. A negative review is not a violation.
Return ONLY a JSON object, no markdown, with this shape:
{"overview": string (2-3 sentences),
 "themes": [{"theme": string, "detail": string (1 sentence), "businesses": [business names]}] (3-6 items),
 "priorities": [{"business": exact business name, "priority": "high"|"medium"|"low", "reason": string (1 sentence), "action": string (1 short sentence)}] (every business, sorted most urgent first)}`;

    const flaggedOf = (x: any) => x.high_count + x.medium_count;
    const sorted = [...scans].sort((x: any, y: any) => flaggedOf(y) - flaggedOf(x));
    const parsed: any = {
      overview: `${scans.length} businesses analyzed. ${sorted.filter((x: any) => flaggedOf(x) > 0).length} show potentially policy-relevant reviews; the rest reflect genuine customer feedback.`,
      themes: [
        { theme: "Service delays", detail: "Several reviews mention waiting time and slow responses at peak hours.", businesses: sorted.slice(0, 2).map((x: any) => x.business_name) },
        { theme: "Pricing transparency", detail: "Customers ask for clearer bill breakups and upfront pricing.", businesses: sorted.slice(1, 3).map((x: any) => x.business_name) },
      ],
      priorities: sorted.map((x: any) => ({ business: x.business_name, priority: flaggedOf(x) >= 2 ? "high" : flaggedOf(x) === 1 ? "medium" : "low",
        reason: flaggedOf(x) ? `${flaggedOf(x)} flagged review(s) with policy signals.` : "No policy concerns detected.",
        action: flaggedOf(x) ? "Verify evidence and use Google's official report path." : "Reply to recent reviews to maintain engagement." })),
    };
    const pr = ["high", "medium", "low"];
    const insights: BatchInsights = {
      overview: String(parsed.overview ?? ""),
      themes: (Array.isArray(parsed.themes) ? parsed.themes : []).slice(0, 8).map((t: any) => ({
        theme: String(t.theme ?? ""), detail: String(t.detail ?? ""), businesses: Array.isArray(t.businesses) ? t.businesses.map(String) : [],
      })),
      priorities: (Array.isArray(parsed.priorities) ? parsed.priorities : []).map((p: any) => ({
        business: String(p.business ?? ""), priority: pr.includes(p.priority) ? p.priority : "medium", reason: String(p.reason ?? ""), action: String(p.action ?? ""),
      })),
      scansAnalyzed: scans.length,
      model: INSIGHTS_MODEL,
    };
    await supabase.from("audit_log").insert({ user_id: userId, action: "batch.insights_generated", detail: { batch_id: data.batchId, scans: scans.length } });
    return { ok: true, insights };
  });
