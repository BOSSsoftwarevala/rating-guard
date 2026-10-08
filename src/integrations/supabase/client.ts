/**
 * Local demo database + auth that mimics the subset of the Supabase JS API this app uses.
 * Data lives in memory and is persisted to localStorage in the browser. No network calls.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { buildSeed, SUPER_ADMIN } from "@/lib/seed";

type Row = any;
type DB = Record<string, Row[]>;
type Res = { data: any; error: { message: string } | null; count?: number | null };

const DB_KEY = "rg-demo-db-v1";
const SESSION_KEY = "rg-demo-session";
const PW_KEY = "rg-demo-password";
const FILES_KEY = "rg-demo-files";
const isBrowser = typeof window !== "undefined";

export const uuid = () =>
  isBrowser && crypto?.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

let db: DB = load();
function load(): DB {
  if (isBrowser) {
    try { const s = localStorage.getItem(DB_KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
  }
  return buildSeed();
}
function persist() { if (isBrowser) try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* quota */ } }
export function resetDemoData() { db = buildSeed(); persist(); }

const FK_OF: Record<string, string> = { scans: "scan_id", reviews: "review_id", scan_batches: "batch_id", businesses: "business_id", reports: "report_id" };

function splitTop(s: string) {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function embed(table: string, row: Row, sel: string): Row {
  const out: Row = { ...row };
  for (const tok of splitTop(sel)) {
    const m = tok.match(/^(?:(\w+):)?(\w+)\((.*)\)$/s);
    if (!m) continue;
    const alias = m[1] ?? m[2]!; const rel = m[2]!; const inner = m[3]!;
    const fk = FK_OF[rel];
    const target = db[rel] ?? [];
    if (fk && fk in row) {
      const hit = target.find((t) => t.id === row[fk]);
      out[alias] = hit ? embed(rel, hit, inner) : null;
    } else {
      const back = FK_OF[table] ?? `${table.replace(/s$/, "")}_id`;
      out[alias] = target.filter((t) => t[back] === row.id).map((t) => embed(rel, t, inner));
    }
  }
  return out;
}

class Query implements PromiseLike<Res> {
  private mode: "select" | "insert" | "update" | "upsert" | "delete" | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private sel = "*";
  private selOpts: { head?: boolean; count?: string } = {};
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private payload: any = null;
  private conflict: string | null = null;
  private ignoreDup = false;
  private one: "single" | "maybe" | null = null;
  private returning = false;
  constructor(private table: string) { db[table] ??= []; }

  select(s = "*", o: { head?: boolean; count?: string } = {}) {
    this.sel = s; this.selOpts = o;
    if (!this.mode) this.mode = "select"; else this.returning = true;
    return this;
  }
  insert(p: any) { this.mode = "insert"; this.payload = p; return this; }
  update(p: any) { this.mode = "update"; this.payload = p; return this; }
  upsert(p: any, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.mode = "upsert"; this.payload = p; this.conflict = o.onConflict ?? "id"; this.ignoreDup = !!o.ignoreDuplicates; return this; }
  delete() { this.mode = "delete"; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  not() { return this; }
  or() { return this; }
  order(col: string, o: { ascending?: boolean } = {}) { this.orders.push({ col, asc: o.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }

  private stamp(r: Row): Row {
    const now = new Date().toISOString();
    return { id: uuid(), created_at: now, updated_at: now, ...r };
  }

  private run(): Res {
    const t = db[this.table]!;
    let rows: Row[] = [];
    if (this.mode === "insert") {
      rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => this.stamp(r));
      t.push(...rows); persist();
    } else if (this.mode === "upsert") {
      const keys = this.conflict!.split(",").map((k) => k.trim());
      for (const p of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const hit = t.find((r) => keys.every((k) => r[k] === p[k]));
        if (hit) { if (!this.ignoreDup) Object.assign(hit, p); rows.push(hit); }
        else { const n = this.stamp(p); t.push(n); rows.push(n); }
      }
      persist();
    } else {
      rows = t.filter((r) => this.filters.every((f) => f(r)));
      if (this.mode === "update") { rows.forEach((r) => Object.assign(r, this.payload)); persist(); }
      if (this.mode === "delete") { db[this.table] = t.filter((r) => !rows.includes(r)); persist(); }
    }
    if (this.mode !== "select" && !this.returning) return { data: null, error: null };
    for (const o of [...this.orders].reverse())
      rows = [...rows].sort((a, b) => (a[o.col] > b[o.col] ? 1 : a[o.col] < b[o.col] ? -1 : 0) * (o.asc ? 1 : -1));
    const count = rows.length;
    if (this.lim != null) rows = rows.slice(0, this.lim);
    if (this.selOpts.head) return { data: null, error: null, count };
    const data = rows.map((r) => embed(this.table, JSON.parse(JSON.stringify(r)), this.sel));
    if (this.one) {
      if (!data.length && this.one === "single") return { data: null, error: { message: "No rows found" } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null, count: this.selOpts.count ? count : null };
  }
  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return new Promise<Res>((res) => setTimeout(() => res(this.run()), 60)).then(ok, bad);
  }
}

/* ---------------- Auth ---------------- */
type Listener = (event: string, session: unknown) => void;
const listeners = new Set<Listener>();
const emit = (e: string) => listeners.forEach((l) => l(e, getSession()));

function getSession() {
  if (!isBrowser) return null;
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
const passwordNow = () => (isBrowser && localStorage.getItem(PW_KEY)) || SUPER_ADMIN.password;
const userObj = () => {
  const s = getSession();
  return s ? { id: SUPER_ADMIN.id, email: s.email, new_email: null, last_sign_in_at: s.at, role: "super_admin" } : null;
};
export const currentUserId = () => SUPER_ADMIN.id;

const auth = {
  async getUser() { const u = userObj(); return { data: { user: u }, error: u ? null : { message: "Not signed in" } }; },
  async getSession() { return { data: { session: getSession() }, error: null }; },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await new Promise((r) => setTimeout(r, 500));
    if (email.toLowerCase() !== SUPER_ADMIN.email || password !== passwordNow())
      return { data: { user: null }, error: { message: "Invalid login credentials" } };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: SUPER_ADMIN.email, at: new Date().toISOString() }));
    emit("SIGNED_IN");
    return { data: { user: userObj() }, error: null };
  },
  async signOut(_o?: unknown) { localStorage.removeItem(SESSION_KEY); emit("SIGNED_OUT"); return { error: null }; },
  async updateUser(p: { password?: string; current_password?: string; email?: string }) {
    if (p.password) {
      if (p.current_password != null && p.current_password !== passwordNow()) return { data: null, error: { message: "Current password is incorrect" } };
      localStorage.setItem(PW_KEY, p.password);
    }
    emit("USER_UPDATED");
    return { data: { user: userObj() }, error: null };
  },
  onAuthStateChange(cb: Listener) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
};

/* ---------------- Storage ---------------- */
const files = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(FILES_KEY) ?? "{}"); } catch { return {}; } };
const storage = {
  from: (_bucket: string) => ({
    async upload(path: string, f: Blob) {
      const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
      const all = files(); all[path] = url;
      try { localStorage.setItem(FILES_KEY, JSON.stringify(all)); } catch { return { data: null, error: { message: "Image too large" } }; }
      return { data: { path }, error: null };
    },
    async createSignedUrl(path: string) { return { data: { signedUrl: files()[path] ?? null }, error: null }; },
  }),
};

export const supabase = { from: (t: string) => new Query(t), auth, storage } as unknown as SupabaseClient<Database>;
