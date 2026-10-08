import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled every minute. Processes a bounded batch of queued bulk-scan jobs.
export const Route = createFileRoute("/api/public/hooks/scan-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { runWorker } = await import("@/lib/queue.server");
        const result = await runWorker({ deadlineMs: 45_000 });
        return Response.json(result);
      },
    },
  },
});
