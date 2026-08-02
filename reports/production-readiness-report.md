# Production Readiness Report

1. **테스트 일시:** 2026-08-02T17:05:00.000Z
2. **대상 URL:** http://localhost:8080
3. **테스트 모드:** smoke + load + admin + side-checks
4. **요청 수 / 동시성:** smoke=3, load=30 / concurrency=10
5. **scan start latency p50 / p95:** 593 / 1507 ms (load; smoke p95=3753ms cold start)
6. **completion time p50 / p95:** 634 / 4719 ms
7. **completed / limited / failed / timeout:** 30/0/0/0 (load)
8. **cached / reusedRunningJob:** 24 / 2
9. **browser fallback 수:** 0 (비율 0%)
10. **platform parser 수:** 6 (캐시 미히트 신규 진단 기준 성공)
11. **정확도 회귀:** PASS (fail=0, risk/personal/sensitive/highRisk loss=0)
12. **증빙 보존:** PASS (temporary zip OK, key screenshots=3, signed URL OK, final_submit_clicked=false)
13. **공개 리포트 안전성:** PASS
14. **관리자 검증:** login=true, unauthBlocked=true, cases=true, detail=true, evidence=true, signedUrl/review/publication API=true
15. **발견된 문제:** Smoke cold-start start p95만 3초 초과. Load·정확도·증빙·공개/관리자 검증은 정상.
16. **운영 가능 판단:** **PASS**

## Next actions
- Keep INTERNAL_WORKER_TOKEN cron kicking `/api/internal/jobs/run-next` on Vercel if needed
- For production load windows, temporarily raise `SCAN_RATE_LIMIT_PER_IP_PER_MINUTE` / `MAX_PENDING_JOBS_PER_IP`
- Re-run `verify:smoke` against production after deploy of fixture URL support

## Check commands
- verify:smoke: PASS
- verify:load: PASS
- verify:admin: PASS
- diagnosis:regression: PASS
- evidence:preservation: PASS
- report:public-safety: PASS
- monitoring:check: PASS
- evidence:check: PASS
- lint: PASS
- build: PASS

## Notes
- Fixture URLs (`sure-check.verify/fixture/*`) only — no third-party form hammering
- Local load window used elevated rate limits (120/min, pending 50)
