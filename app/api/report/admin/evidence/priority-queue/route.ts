import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { enqueuePendingCaptureJob } from "@/lib/jobs/captureJobQueue";
import {
  QueueSchemaNotReadyError,
  assertQueueSchemaReady,
} from "@/lib/jobs/queueSchema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAdminCases } from "@/lib/report/adminCases";
import {
  isPriorityEvidenceCandidate,
  PRIORITY_EVIDENCE_MAX_ENQUEUE,
} from "@/lib/report/priorityEvidenceQueue";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createCaptureId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();
  if (!isMonitoringConfigured()) {
    return NextResponse.json(
      { ok: false, error: "캡처 대기열이 구성되지 않았습니다." },
      { status: 503 },
    );
  }
  try {
    await assertQueueSchemaReady();
  } catch (err) {
    const message =
      err instanceof QueueSchemaNotReadyError
        ? err.message
        : "진단 대기열 설정이 완료되지 않았습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    caseIds?: string[];
    limit?: number;
  };
  const limit = Math.min(
    PRIORITY_EVIDENCE_MAX_ENQUEUE,
    Math.max(1, Number(body.limit) || PRIORITY_EVIDENCE_MAX_ENQUEUE),
  );

  const payload = await listAdminCases({ range: "all" });
  let targets = payload.priorityEvidence;
  if (Array.isArray(body.caseIds) && body.caseIds.length > 0) {
    const wanted = new Set(body.caseIds);
    targets = payload.cases.filter(
      (row) => wanted.has(row.id) && isPriorityEvidenceCandidate(row),
    );
  }
  targets = targets.slice(0, limit);

  const supabase = createSupabaseServerClient();
  const scanJobIds = targets
    .map((row) => row.scanJobId)
    .filter((id): id is string => Boolean(id));
  const diagnosisByScan = new Map<string, string>();
  if (scanJobIds.length > 0) {
    const { data } = await supabase
      .from("scan_jobs")
      .select("id, external_scan_id")
      .in("id", scanJobIds);
    for (const row of data || []) {
      const ext = String(row.external_scan_id || "");
      if (ext) diagnosisByScan.set(String(row.id), ext);
    }
  }

  const queued: Array<{ caseId: string; captureJobId: string }> = [];
  const skipped: Array<{ caseId: string; reason: string }> = [];

  for (const row of targets) {
    const surveyUrl = String(row.surveyUrl || "").trim();
    const diagnosisId = row.scanJobId
      ? diagnosisByScan.get(row.scanJobId) || ""
      : "";
    if (!surveyUrl || !diagnosisId) {
      skipped.push({
        caseId: row.id,
        reason: !surveyUrl ? "survey_url missing" : "diagnosisId missing",
      });
      continue;
    }
    const safety = await safeUrlCheck(surveyUrl);
    if (!safety.safe) {
      skipped.push({ caseId: row.id, reason: safety.reason || "unsafe url" });
      continue;
    }
    const captureJobId = createCaptureId();
    await enqueuePendingCaptureJob({
      externalCaptureId: captureJobId,
      diagnosisId,
      surveyUrl,
      finalUrl: safety.normalizedUrl || surveyUrl,
      mode: "evidence_full_walkthrough",
    });
    queued.push({ caseId: row.id, captureJobId });
  }

  return NextResponse.json({
    ok: true,
    queued: queued.length,
    skipped: skipped.length,
    jobs: queued,
    async: true,
    processInline: false,
  });
}
