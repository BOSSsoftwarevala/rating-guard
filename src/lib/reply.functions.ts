import { createServerFn } from "@/lib/mock-server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/mock-server";

export const REPLY_MODEL = "openai/gpt-6-astra";
export const REPLY_TONES = ["professional", "friendly", "calm", "apologetic", "firm", "short", "detailed"] as const;

export type ReplySuggestion = { summary: string; riskExplanation: string; recommendedAction: string; reply: string; tone: string; model: string };

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", err: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "error" || ev.type === "response.failed") err = ev.error?.message ?? ev.response?.error?.message ?? "AI request failed.";
      } catch { /* partial */ }
    }
  }
  if (err) throw new Error(err);
  return text;
}

/** Vala AI — review intelligence assistant: summary, risk explanation and an editable reply draft. */
export const suggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: z.string().uuid(), tone: z.enum(REPLY_TONES) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; suggestion: ReplySuggestion } | { ok: false; message: string }> => {
    const { supabase, userId } = context;

    const { data: r, error } = await supabase
      .from("reviews")
      .select("id, scan_id, author, rating, text, review_analyses(risk, category, reason, evidence), scans(business_name, category)")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (error) return { ok: false, message: "Database unavailable — could not load the review." };
    if (!r) return { ok: false, message: "Review not found." };
    const a: any = Array.isArray((r as any).review_analyses) ? (r as any).review_analyses[0] : (r as any).review_analyses;
    const s: any = (r as any).scans;

    await new Promise((res) => setTimeout(res, 700));
    const name = s?.business_name ?? "our team";
    const first = String(r.author).split(" ")[0];
    const risky = a && (a.risk === "high" || a.risk === "medium");
    const T: Record<string, string> = { professional: "Thank you for your feedback", friendly: "Hi", calm: "Thank you for taking the time to share this", apologetic: "We are truly sorry", firm: "Thank you for your review", short: "Thanks", detailed: "Thank you for sharing your detailed experience" };
    const open = `${T[data.tone]}, ${first}.`;
    const body = r.rating >= 4
      ? ` We're delighted you enjoyed your visit to ${name} and look forward to welcoming you again soon.`
      : risky
        ? ` We take every comment seriously, but we couldn't match these details to a visit in our records. Please contact us directly so we can understand and help.`
        : ` We're sorry your experience didn't meet expectations. Please reach out to us directly so we can make this right.`;
    const p = {
      summary: r.text ? `${r.rating}★ review: "${String(r.text).slice(0, 80)}${String(r.text).length > 80 ? "…" : ""}"` : `${r.rating}★ rating without text.`,
      riskExplanation: a?.reason ?? "No clear policy concern.",
      recommendedAction: risky ? "Reply neutrally and consider Google's official reporting path." : "Reply politely to show you value feedback.",
      reply: data.tone === "short" ? `${open}${r.rating >= 4 ? " See you again soon!" : " Please contact us directly so we can help."}` : open + body + (data.tone === "detailed" ? ` — Team ${name}` : ""),
    };
    await supabase.from("audit_log").insert({ user_id: userId, action: "review.reply_suggested", detail: { review_id: r.id, scan_id: r.scan_id, tone: data.tone, model: REPLY_MODEL } });
    return { ok: true, suggestion: { summary: String(p.summary ?? ""), riskExplanation: String(p.riskExplanation ?? ""), recommendedAction: String(p.recommendedAction ?? ""), reply: String(p.reply), tone: data.tone, model: REPLY_MODEL } };
  });
