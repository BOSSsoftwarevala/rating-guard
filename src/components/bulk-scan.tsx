import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, RotateCcw } from "lucide-react";
import { scanFetch, scanAnalyze, createBatch } from "@/lib/scan.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const CONCURRENCY = 2; // keep Google request rate low
const MAX_URLS = 500;

type RowStatus = "pending" | "processing" | "completed" | "partial" | "failed";
type Row = { url: string; status: RowStatus; scanId?: string | undefined; error?: string | undefined; business?: string | null | undefined; rating?: number | null | undefined; reviews?: number | undefined; high?: number | undefined; medium?: number | undefined };
type Checked = { valid: string[]; invalid: string[]; duplicates: string[] };

export function isGoogleUrl(v: string) {
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return /(^|\.)google\.[a-z.]+$/.test(u.hostname) || /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co)$/.test(u.hostname);
  } catch { return false; }
}

function normalize(v: string) {
  try { const u = new URL(v.trim()); u.hash = ""; return (u.origin + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase(); } catch { return v.trim().toLowerCase(); }
}

function parseInput(text: string): Checked {
  const lines = text.split(/\r?\n/).map((l) => l.split(",")[0]!.trim().replace(/^"|"$/g, "")).filter(Boolean)
    .filter((l) => !/^(google_url|url)$/i.test(l));
  const seen = new Set<string>(); const out: Checked = { valid: [], invalid: [], duplicates: [] };
  for (const l of lines) {
    if (!isGoogleUrl(l)) { out.invalid.push(l); continue; }
    const k = normalize(l);
    if (seen.has(k)) { out.duplicates.push(l); continue; }
    seen.add(k); out.valid.push(l.trim());
  }
  return out;
}

export function BulkScan({ disabled }: { disabled: boolean }) {
  const fetchStage = useServerFn(scanFetch);
  const analyzeStage = useServerFn(scanAnalyze);
  const newBatch = useServerFn(createBatch);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [batch, setBatch] = useState<{ id: string; batch_number: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function runOne(i: number, url: string, batchId: string) {
    patch(i, { status: "processing", error: undefined });
    try {
      const a = await fetchStage({ data: { url, batchId } });
      if (!a.ok) { patch(i, { status: "failed", error: a.message, scanId: a.scanId }); return; }
      patch(i, { scanId: a.scanId });
      const b = await analyzeStage({ data: { scanId: a.scanId } });
      const { data: s } = await supabase.from("scans").select("business_name, rating, reviews_retrieved, high_count, medium_count").eq("id", a.scanId).maybeSingle();
      patch(i, { status: b.ok ? "completed" : "partial", error: b.ok ? undefined : b.message, business: s?.business_name, rating: s?.rating, reviews: s?.reviews_retrieved, high: s?.high_count, medium: s?.medium_count });
    } catch { patch(i, { status: "failed", error: "Network error." }); }
  }

  async function start() {
    if (!checked?.valid.length) return;
    setErr(null); setRunning(true);
    try {
      const b = await newBatch({ data: { total: checked.valid.length } });
      setBatch(b);
      const list = checked.valid;
      setRows(list.map((url) => ({ url, status: "pending" })));
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
        while (next < list.length) { const i = next++; await runOne(i, list[i]!, b.id); }
      }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Batch failed to start."); }
    finally { setRunning(false); qc.invalidateQueries({ queryKey: ["scans"] }); }
  }

  async function retry(i: number) {
    if (!batch) return;
    setRunning(true); await runOne(i, rows[i]!.url, batch.id); setRunning(false);
    qc.invalidateQueries({ queryKey: ["scans"] });
  }

  async function onFile(f: File | undefined) {
    if (!f) return; const t = await f.text(); setText(t); setChecked(parseInput(t)); setRows([]);
  }

  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const tooMany = (checked?.valid.length ?? 0) > MAX_URLS;

  return (
    <div className="mt-6 rounded-2xl bg-card p-4 text-left text-foreground shadow-[var(--shadow-scanner-glow)]">
      <label htmlFor="bulk-urls" className="text-sm font-semibold">Paste URLs (one per line) or upload a CSV with a <span className="font-mono">google_url</span> column</label>
      <textarea id="bulk-urls" value={text} disabled={running} onChange={(e) => { setText(e.target.value); setChecked(null); }}
        rows={6} placeholder={"https://maps.app.goo.gl/...\nhttps://www.google.com/maps/place/..."}
        className="mt-2 w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={running} onClick={() => fileRef.current?.click()}><Upload /> Upload CSV</Button>
        <Button type="button" variant="outline" size="sm" disabled={running || !text.trim()} onClick={() => { setChecked(parseInput(text)); setRows([]); }}>Validate</Button>
        <Button type="button" size="sm" disabled={disabled || running || !checked?.valid.length || tooMany} onClick={start}>
          {running && <Loader2 className="animate-spin" />} Start batch ({checked?.valid.length ?? 0})
        </Button>
      </div>

      {checked && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <Bucket label="Valid URLs" items={checked.valid} tone="text-risk-normal" />
          <Bucket label="Invalid URLs" items={checked.invalid} tone="text-risk-high" />
          <Bucket label="Duplicate URLs" items={checked.duplicates} tone="text-risk-medium" />
        </div>
      )}
      {tooMany && <p className="mt-2 text-sm text-risk-high">Maximum {MAX_URLS} URLs per batch.</p>}
      {err && <p role="alert" className="mt-2 text-sm text-risk-high">{err}</p>}

      {batch && rows.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <b>Batch Scan #{batch.batch_number}</b>
            <span>Total {rows.length}</span><span>Completed {count("completed")}</span><span>Processing {count("processing")}</span>
            <span>Partial {count("partial")}</span><span>Failed {count("failed")}</span><span>Pending {count("pending")}</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr className="border-b text-left">
                {["#", "Business", "URL", "Rating", "Reviews found", "High", "Medium", "Status", "Action"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-b align-top">
                  <td className="p-2 font-mono">{i + 1}</td>
                  <td className="p-2">{r.business ?? "—"}</td>
                  <td className="max-w-[220px] truncate p-2 font-mono" title={r.url}>{r.url}</td>
                  <td className="p-2">{r.rating ?? "—"}</td>
                  <td className="p-2">{r.reviews ?? "—"}</td>
                  <td className="p-2">{r.high ?? "—"}</td>
                  <td className="p-2">{r.medium ?? "—"}</td>
                  <td className="p-2"><span className="capitalize">{r.status}</span>{r.error && <div className="mt-1 max-w-[220px] text-muted-foreground">{r.error}</div>}</td>
                  <td className="space-x-2 whitespace-nowrap p-2">
                    {r.scanId && <Link to="/history" className="text-primary underline">View</Link>}
                    {(r.status === "failed" || r.status === "partial") && !running && <button type="button" onClick={() => retry(i)} className="inline-flex items-center gap-1 text-primary underline"><RotateCcw className="h-3 w-3" />Retry</button>}
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Bucket({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`font-semibold ${tone}`}>{label}: {items.length}</div>
      {items.length > 0 && <ul className="mt-1 max-h-28 overflow-auto font-mono text-xs text-muted-foreground">{items.map((u, i) => <li key={i} className="truncate" title={u}>{u}</li>)}</ul>}
    </div>
  );
}
