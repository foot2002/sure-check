"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error || "로그인에 실패했습니다.");
        return;
      }
      router.replace("/report/admin");
      router.refresh();
    } catch {
      setError("로그인 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 shadow-xl">
        <p className="text-xs font-semibold tracking-wide text-teal-300">
          SURE Check Admin
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">관리자 로그인</h1>
        <p className="mt-2 text-sm text-slate-400">
          검토 콘솔은 비밀번호로 보호됩니다. 공개 모니터링(`/report`)과는
          분리되어 있습니다.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-teal-400"
              required
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
          >
            {loading ? "확인 중…" : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
