import { useEffect, useState } from "react";
import type { ConfigView, RepoSummary, ReviewResult, Severity } from "./types";

interface DashboardPayload {
  summary: RepoSummary;
  review: ReviewResult;
  config: ConfigView;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

function toneForScore(score: number): string {
  if (score >= 90) return "#34d399";
  if (score >= 70) return "#fbbf24";
  return "#f87171";
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color = toneForScore(score);

  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img">
        <title>{`${label} score: ${score} out of 100`}</title>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#1b2030" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-slate-600">
        No commit history available yet
      </div>
    );
  }
  const width = 520;
  const height = 112;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - 10 - (value / max) * (height - 26);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-28 w-full"
      preserveAspectRatio="none"
      aria-label="Commit velocity"
      role="img"
    >
      <title>Commit velocity over the last 14 days</title>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1="0"
          x2={width}
          y1={height * ratio}
          y2={height * ratio}
          stroke="#1b2030"
          strokeDasharray="4 8"
        />
      ))}
      <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#sparkFill)" />
      <polyline
        points={points}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint: string;
  accent: string;
}) {
  return (
    <div className="panel relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="panel-title">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-2 line-clamp-2 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const classes: Record<Severity, string> = {
    critical: "bg-red-500/15 text-red-300 border-red-500/30",
    high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes[severity]}`}
    >
      {severity}
    </span>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      role="img"
    >
      <title>Refresh dashboard data</title>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" strokeLinecap="round" />
      <path d="M20 4v7h-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      role="img"
    >
      <title>GitWhisper security guard</title>
      <path
        d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    void nonce;
    let active = true;
    setError("");
    Promise.all([
      fetchJson<RepoSummary>("/api/summary"),
      fetchJson<ReviewResult>("/api/review"),
      fetchJson<ConfigView>("/api/config"),
    ])
      .then(([summary, review, config]) => {
        if (active) setData({ summary, review, config });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl">⚠️</div>
        <h1 className="mt-5 text-2xl font-semibold">Dashboard data unavailable</h1>
        <p className="muted mt-2 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          className="mt-6 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20"
        >
          Try again
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ink-800" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-36 animate-pulse rounded-2xl border border-ink-700 bg-ink-850"
            />
          ))}
        </div>
      </main>
    );
  }

  const { summary, review, config } = data;
  const maxType = Math.max(...summary.commitTypes.map((item) => item.value), 1);
  const maxFile = Math.max(...summary.topFiles.map((item) => item.changes), 1);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/20 to-indigo-500/20 text-lg font-bold text-cyan-200 shadow-glow">
            GW
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">GitWhisper</h1>
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                LOCAL
              </span>
            </div>
            <p className="muted mt-1 text-xs">
              {summary.repository} ·{" "}
              <span className="font-mono text-slate-300">{summary.branch}</span> · updated{" "}
              {shortDate(summary.generatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-ink-700 bg-ink-850 px-3 py-2 text-xs text-slate-400 sm:flex">
            <ShieldIcon />
            <span>
              {String(config.provider)} · {String(config.model)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <RefreshIcon />
            Refresh
          </button>
        </div>
      </header>

      <section className="mt-10 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="panel flex flex-col justify-between sm:flex-row sm:items-center">
          <div>
            <div className="panel-title">Repository health</div>
            <h2 className="mt-3 max-w-md text-2xl font-semibold leading-snug tracking-tight text-slate-100">
              Security-aware signals from your working tree.
            </h2>
            <p className="muted mt-3 max-w-lg text-sm">{review.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-slate-400">
                {review.filesChanged} files changed
              </span>
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                +{review.additions} additions
              </span>
              <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-300">
                −{review.deletions} deletions
              </span>
            </div>
          </div>
          <div className="mt-6 sm:mt-0">
            <ScoreRing score={summary.healthScore} label="health" />
          </div>
        </div>

        <div className="panel flex items-center justify-around gap-4">
          <ScoreRing score={review.score} label="review" />
          <div className="space-y-3">
            <MetricCard
              label="Secrets"
              value={summary.secretFindings}
              hint={
                summary.secretFindings ? "Rotate exposed credentials" : "No leaked keys detected"
              }
              accent={summary.secretFindings ? "#f87171" : "#34d399"}
            />
            <MetricCard
              label="Commits"
              value={summary.commits.length}
              hint="Recent history scanned"
              accent="#818cf8"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="panel-title">Commit velocity</div>
              <p className="muted mt-1 text-xs">Last 14 days of activity</p>
            </div>
            <span className="font-mono text-xs text-cyan-300">{summary.velocity.length} days</span>
          </div>
          <div className="mt-5">
            <Sparkline values={summary.velocity.map((item) => item.count)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Commit types</div>
          <div className="mt-5 space-y-3">
            {summary.commitTypes.length ? (
              summary.commitTypes.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-300">{item.label}</span>
                    <span className="text-slate-500">{item.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400"
                      style={{ width: `${(item.value / maxType) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted text-sm">No conventional commits detected yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-title">Review insights</div>
          <ul className="mt-4 space-y-3">
            {review.suggestions.map((suggestion, index) => (
              <li key={suggestion} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <span className="mt-0.5 font-mono text-xs text-cyan-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-title">Secret guard</div>
          {review.findings.length ? (
            <div className="mt-4 space-y-3">
              {review.findings.slice(0, 5).map((finding, index) => (
                <div
                  key={`${finding.rule}-${index}`}
                  className="rounded-xl border border-ink-700 bg-ink-900/70 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">{finding.rule}</span>
                    <SeverityPill severity={finding.severity} />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    {finding.file}:{finding.line} · {finding.redacted}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
              <span className="text-xl">✓</span>
              No secrets detected in added lines.
            </div>
          )}
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-title">Top changed files</div>
          <div className="mt-4 space-y-3">
            {summary.topFiles.length ? (
              summary.topFiles.map((file) => (
                <div key={file.path}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-mono text-slate-300">{file.path}</span>
                    <span className="shrink-0 text-slate-500">{file.changes} lines</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-indigo-400/80"
                      style={{ width: `${(file.changes / maxFile) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted text-sm">No diff available in the current working tree.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Recent commits</div>
          <div className="mt-4 divide-y divide-ink-700/70">
            {summary.commits.slice(0, 6).map((commit) => (
              <div key={commit.hash} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="mt-0.5 rounded-md bg-ink-800 px-1.5 py-1 font-mono text-[10px] text-cyan-300">
                  {commit.hash}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-300">{commit.message}</p>
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    {commit.author} · {shortDate(commit.date)}
                  </p>
                </div>
              </div>
            ))}
            {!summary.commits.length && (
              <p className="muted py-3 text-sm">No commits found in this repository.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-700/70 pt-6 text-xs text-slate-600">
        <span>Generated by GitWhisper · engine {review.engine}</span>
        <span>
          Offline mode:{" "}
          <span className={config.offline ? "text-amber-300" : "text-emerald-300"}>
            {config.offline ? "on" : "off"}
          </span>
          {config.demo ? " · demo data" : ""}
        </span>
      </footer>
    </div>
  );
}
