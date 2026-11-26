/** Lightweight local HTTP server for the GitWhisper dashboard. */

import { readFile } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { basename, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, maskedConfig } from "../core/config.js";
import {
  DEMO_DIFF,
  currentBranch,
  parseDiff,
  readStagedDiff,
  readWorkingDiff,
  recentCommits,
} from "../core/git.js";
import { heuristicReview } from "../core/insights.js";
import { countBySeverity, scanDiff } from "../core/scanner.js";
import type { RepoCommit, RepoSummary } from "../core/types.js";
import { EMBEDDED_DASHBOARD_HTML } from "./embedded.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WEB_DIST = resolve(PROJECT_ROOT, "web", "dist");

const DEMO_COMMITS: RepoCommit[] = [
  {
    hash: "a1b2c3d4",
    message: "feat(payments): add Stripe charge support",
    date: new Date().toISOString(),
    author: "demo",
  },
  {
    hash: "e5f6a7b8",
    message: "test(payments): cover INR formatting",
    date: new Date(Date.now() - 86_400_000).toISOString(),
    author: "demo",
  },
  {
    hash: "c9d0e1f2",
    message: "docs: document billing helper",
    date: new Date(Date.now() - 172_800_000).toISOString(),
    author: "demo",
  },
];

export interface DashboardOptions {
  cwd?: string;
  port?: number;
  host?: string;
  demo?: boolean;
}

export interface DashboardServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function currentDiff(cwd: string | undefined, demo: boolean): Promise<string> {
  if (demo) return DEMO_DIFF;
  try {
    const staged = await readStagedDiff(cwd);
    if (staged.trim()) return staged;
  } catch {
    // Fall through to the working tree.
  }
  try {
    return await readWorkingDiff(cwd);
  } catch {
    return "";
  }
}

/** Aggregate real git history and local secret signals for the dashboard. */
export async function buildRepoSummary(
  cwd: string | undefined,
  demo = false,
): Promise<RepoSummary> {
  let commits: RepoCommit[] = [];
  let branch = "unknown";
  if (demo) {
    commits = DEMO_COMMITS;
    branch = "feat/demo";
  } else {
    try {
      commits = await recentCommits(cwd, 50);
    } catch {
      commits = [];
    }
    branch = await currentBranch(cwd);
  }

  const parsed = parseDiff(await currentDiff(cwd, demo));
  const findings = scanDiff(parsed);
  const counts = countBySeverity(findings);

  const velocityMap = new Map<string, number>();
  for (const commit of commits) {
    const day = commit.date.slice(0, 10);
    velocityMap.set(day, (velocityMap.get(day) ?? 0) + 1);
  }
  const velocity = [...velocityMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const typeMap = new Map<string, number>();
  for (const commit of commits) {
    const type = /^(\w+)(?:\([^)]+\))?:/.exec(commit.message)?.[1]?.toLowerCase() ?? "other";
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
  }
  const commitTypes = [...typeMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const fileMap = new Map<string, number>();
  for (const file of parsed.files) {
    fileMap.set(file.path, file.additions + file.deletions);
  }
  const topFiles = [...fileMap.entries()]
    .map(([path, changes]) => ({ path, changes }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 8);

  const healthScore = Math.max(0, 100 - counts.critical * 15 - counts.high * 8 - counts.medium * 3);

  return {
    repository: basename(resolve(cwd ?? process.cwd())),
    branch,
    generatedAt: new Date().toISOString(),
    commits,
    velocity,
    commitTypes,
    topFiles,
    secretFindings: findings.length,
    healthScore,
  };
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function serveAsset(response: ServerResponse, pathname: string): Promise<void> {
  const root = WEB_DIST;
  const requested = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (requested !== root && !requested.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  const candidates = [requested];
  if (!extname(pathname)) candidates.push(resolve(root, "index.html"));

  for (const candidate of candidates) {
    try {
      const body = await readFile(candidate);
      response.writeHead(200, {
        "content-type": MIME[extname(candidate)] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      response.end(body);
      return;
    } catch {
      // Try the SPA fallback next.
    }
  }

  try {
    const index = await readFile(resolve(root, "index.html"), "utf8");
    sendHtml(response, index);
  } catch {
    sendHtml(response, EMBEDDED_DASHBOARD_HTML);
  }
}

/** Start the local dashboard. It never binds to a public interface. */
export async function startDashboardServer(
  options: DashboardOptions = {},
): Promise<DashboardServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4321;
  const demo = Boolean(options.demo);

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", `http://${host}`);
        const pathname = decodeURIComponent(url.pathname);

        if (pathname === "/api/health") {
          sendJson(response, 200, { ok: true, demo });
          return;
        }
        if (pathname === "/api/summary") {
          sendJson(
            response,
            200,
            await buildRepoSummary(options.cwd, demo || url.searchParams.get("demo") === "1"),
          );
          return;
        }
        if (pathname === "/api/review") {
          const parsed = parseDiff(
            await currentDiff(options.cwd, demo || url.searchParams.get("demo") === "1"),
          );
          const findings = scanDiff(parsed);
          sendJson(response, 200, heuristicReview(parsed, findings));
          return;
        }
        if (pathname === "/api/config") {
          const config = await loadConfig();
          sendJson(response, 200, { ...maskedConfig(config), demo });
          return;
        }
        await serveAsset(response, pathname);
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      server.off("error", fail);
      done();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()));
      }),
  };
}
