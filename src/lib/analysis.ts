// Local, explainable review-signal classifier used by the demo (no external AI calls).
export const ANALYSIS_MODEL = "guard-signal-v3";
export const AI_PROVIDER = "Rating Guard Intelligence";
export const PROMPT_VERSION = "p-2026.10";

export type ReviewAnalysis = { risk: "high" | "medium" | "normal" | "requires_review"; category: string | null; signals: string[]; reason: string | null; evidence: string | null; confidence: number };

const RULES: { re: RegExp; category: string; signal: string; risk: "high" | "medium"; reason: string }[] = [
  { re: /(call|whatsapp|contact)\s*(me|us)?\s*(on|at)?\s*\+?\d[\d\s-]{7,}|\b\d{10}\b/i, category: "Personal information", signal: "phone number", risk: "high", reason: "Review contains a phone number or private contact details." },
  { re: /(visit|check out|use code|discount at|www\.|https?:\/\/|\.com\b)/i, category: "Spam / promotional", signal: "promotional link", risk: "high", reason: "Review promotes another business or contains a link/code." },
  { re: /(idiot|stupid|fraud(ster)?s?|thie(f|ves)|cheaters?|scam(mers)?|liars?|useless people|shameless)/i, category: "Abusive / harassment", signal: "abusive language", risk: "medium", reason: "Review uses insulting or accusatory language aimed at people." },
  { re: /(i work(ed)? (at|for)|former employee|ex-employee|our competitor|better than this place, go to|owner of .* next door)/i, category: "Conflict of interest", signal: "conflict of interest", risk: "high", reason: "Reviewer indicates a conflict of interest (employee or competitor)." },
  { re: /(never (been|visited|went)|haven'?t (been|visited)|heard from (a )?friend|my friend said|didn'?t go)/i, category: "Not based on real experience", signal: "no first-hand experience", risk: "medium", reason: "Reviewer states they did not personally experience the business." },
  { re: /(election|politic|cricket match|bollywood|off topic|nothing to do with)/i, category: "Off-topic", signal: "off-topic content", risk: "medium", reason: "Review content is unrelated to the business experience." },
];

export function classify(text: string | null, rating: number): ReviewAnalysis {
  const t = (text ?? "").trim();
  if (!t) return { risk: "requires_review", category: null, signals: ["rating only"], reason: "No text — a rating alone cannot be assessed against policy.", evidence: null, confidence: 40 };
  const hits = RULES.filter((r) => r.re.test(t));
  if (hits.length) {
    const top = hits.find((h) => h.risk === "high") ?? hits[0]!;
    const m = t.match(top.re);
    const conf = Math.min(97, 68 + hits.length * 9 + (rating <= 2 ? 6 : 0));
    return { risk: top.risk, category: top.category, signals: hits.map((h) => h.signal), reason: top.reason, evidence: m ? m[0] : null, confidence: conf };
  }
  if (rating <= 2 && t.length < 25) return { risk: "requires_review", category: null, signals: ["very short negative"], reason: "Very short negative review — context is insufficient to judge.", evidence: t, confidence: 52 };
  return { risk: "normal", category: null, signals: [], reason: rating <= 2 ? "Genuine negative feedback about the experience — not a policy issue." : "Legitimate customer experience.", evidence: null, confidence: 88 + Math.round((t.length % 9)) };
}
