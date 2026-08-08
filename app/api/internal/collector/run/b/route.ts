import { handleCollectorRunRequest } from "@/lib/collector/handleCollectorRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Timeout ceiling only (Fluid Compute Hobby max 300s). Soft target remains ≪180s. */
export const maxDuration = 300;

/** Vercel Cron / manual: partition B only */
export async function GET(request: Request) {
  return handleCollectorRunRequest(request, { partition: "b" });
}

export async function POST(request: Request) {
  return handleCollectorRunRequest(request, { partition: "b" });
}
