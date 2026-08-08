import { handleCollectorRunRequest } from "@/lib/collector/handleCollectorRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Vercel Cron / manual: partition B only */
export async function GET(request: Request) {
  return handleCollectorRunRequest(request, { partition: "b" });
}

export async function POST(request: Request) {
  return handleCollectorRunRequest(request, { partition: "b" });
}
