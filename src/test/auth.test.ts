import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";

describe("super admin login", () => {
  it("accepts theratingguard@gmail.com / manoj6882", async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: "theratingguard@gmail.com", password: "manoj6882" });
    expect(error).toBeNull();
  });
  it("rejects a wrong password", async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: "theratingguard@gmail.com", password: "wrong" });
    expect(error).not.toBeNull();
  });
});
