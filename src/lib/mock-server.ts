/**
 * Browser-side stand-in for TanStack server functions. Every "server function" in this
 * demo runs locally against the in-memory demo database — no external APIs are called.
 */
import { supabase, currentUserId } from "@/integrations/supabase/client";

type Ctx = { supabase: typeof supabase; userId: string };
type Handler<I, O> = (args: { data: I; context: Ctx }) => Promise<O> | O;

export const requireSupabaseAuth = "requireSupabaseAuth";

class Builder<I = undefined> {
  private validate: ((d: unknown) => I) | null = null;
  middleware(_m: unknown[]) { return this; }
  inputValidator<J>(v: (d: unknown) => J) {
    const b = this as unknown as Builder<J>;
    (b as any).validate = v;
    return b;
  }
  handler<O>(h: Handler<I, O>) {
    const validate = this.validate;
    return async (opts?: { data?: unknown }): Promise<O> => {
      await new Promise((r) => setTimeout(r, 120));
      const data = (validate ? validate(opts?.data) : opts?.data) as I;
      return h({ data, context: { supabase, userId: currentUserId() } });
    };
  }
}

export const localFn = (_o?: { method?: string }) => new Builder();
export const useLocalFn = <F>(f: F) => f;
