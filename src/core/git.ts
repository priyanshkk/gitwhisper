/** Git diff ingestion, parsing and chunking. */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import type { DiffFile, DiffHunk, DiffLine, ParsedDiff, RepoCommit } from "./types.js";

export const DEFAULT_MAX_DIFF_CHARS = 60_000;

/** Fake Stripe-shaped sample, assembled at runtime so scanners never see a real-looking token in source. */
export const DEMO_STRIPE_KEY = ["sk_live_", "51H8xQ2eZvKYlo2", "C9xQ7pLmN0"].join("");

/** A realistic staged diff used by --demo so the CLI works with no repo or key. */
export const DEMO_DIFF = `diff --git a/src/services/payments.ts b/src/services/payments.ts
new file mode 100644
index 0000000..a4f9c21
--- /dev/null
+++ b/src/services/payments.ts
@@ -0,0 +1,24 @@
+import { fetchInvoice } from "./billing.js";
+
+const stripeKey = "${DEMO_STRIPE_KEY}";
+
+export async function chargeCustomer(id: string) {
+  const invoice = await fetchInvoice(id);
+  const response = await fetch("https://api.stripe.com/v1/charges", {
+    method: "POST",
+    headers: { Authorization: \`Bearer \${stripeKey}\` },
+    body: JSON.stringify({ amount: invoice.total, currency: "inr" }),
+  });
+  if (!response.ok) {
+    console.log("charge failed for " + id);
+  }
+  return response.json();
+}
+
+export function formatAmount(value: number): string {
+  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
+}
diff --git a/src/services/payments.test.ts b/src/services/payments.test.ts
new file mode 100644
index 0000000..7b1c0de
--- /dev/null
+++ b/src/services/payments.test.ts
@@ -0,0 +1,8 @@
+import { describe, expect, it } from "vitest";
+import { formatAmount } from "./payments.js";
+
+describe("formatAmount", () => {
+  it("formats INR values", () => {
+    expect(formatAmount(1250)).toContain("₹");
+  });
+});
diff --git a/README.md b/README.md
index 9fce8aa..c3e0b71 100644
--- a/README.md
+++ b/README.md
@@ -12,3 +12,5 @@ A tiny payments helper.
 ## Usage
 Import the helper and call chargeCustomer.
+
+Added Stripe charge support and INR formatting.
`;

export function createGit(cwd: string = process.cwd()): SimpleGit {
  return simpleGit({ baseDir: cwd, timeout: { block: 15_000 } });
}

/** Read the staged diff. Returns an empty string in repositories with no staged files. */
export async function readStagedDiff(cwd?: string): Promise<string> {
  return createGit(cwd).diff(["--cached", "--unified=3", "--no-color", "--no-ext-diff"]);
}

/** Read the working-tree diff, used by PR generation when nothing is staged. */
export async function readWorkingDiff(cwd?: string): Promise<string> {
  return createGit(cwd).diff(["--unified=3", "--no-color", "--no-ext-diff"]);
}

/** Parse a unified diff into files, hunks and line metadata. */
export function parseDiff(raw: string): ParsedDiff {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let newLine = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current = { path: extractPath(line), additions: 0, deletions: 0, hunks: [] };
      files.push(current);
      hunk = undefined;
      continue;
    }
    if (line.startsWith("+++ ") && current) {
      const path = line.slice(4).trim();
      if (path !== "/dev/null") current.path = path.replace(/^b\//, "");
      continue;
    }
    if (
      line.startsWith("--- ") ||
      line.startsWith("index ") ||
      line.startsWith("new file ") ||
      line.startsWith("deleted file ")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      if (!current) continue;
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      newLine = match ? Number(match[1]) : 0;
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (!current || !hunk) continue;

    if (line.startsWith("+")) {
      const entry: DiffLine = { kind: "add", content: line.slice(1), lineNumber: newLine++ };
      hunk.lines.push(entry);
      current.additions += 1;
    } else if (line.startsWith("-")) {
      hunk.lines.push({ kind: "del", content: line.slice(1), lineNumber: newLine });
      current.deletions += 1;
    } else if (line.startsWith(" ") || line === "") {
      hunk.lines.push({ kind: "context", content: line.slice(1), lineNumber: newLine++ });
    }
  }

  return {
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
    raw,
    truncated: raw.length > DEFAULT_MAX_DIFF_CHARS,
  };
}

function extractPath(header: string): string {
  const match = / b\/(.+)$/.exec(header);
  return match ? match[1] : header.slice(11);
}

/** Split a large parsed diff into model-friendly chunks without cutting lines. */
export function chunkDiff(parsed: ParsedDiff, maxChars = 12_000): string[] {
  const chunks: string[] = [];
  let buffer = "";
  for (const file of parsed.files) {
    const block = [
      `diff --git a/${file.path} b/${file.path}`,
      ...file.hunks.flatMap((hunk) => [
        hunk.header,
        ...hunk.lines.map(
          (line) => `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.content}`,
        ),
      ]),
    ].join("\n");
    if (buffer && buffer.length + block.length > maxChars) {
      chunks.push(buffer);
      buffer = "";
    }
    buffer += `${buffer ? "\n" : ""}${block}`;
  }
  if (buffer) chunks.push(buffer);
  return chunks.length > 0 ? chunks : [parsed.raw];
}

/** Flatten only added lines, which is what the secret scanner should inspect. */
export function addedLines(
  parsed: ParsedDiff,
): Array<{ file: string; line: number; content: string }> {
  return parsed.files.flatMap((file) =>
    file.hunks.flatMap((hunk) =>
      hunk.lines
        .filter((line) => line.kind === "add")
        .map((line) => ({ file: file.path, line: line.lineNumber, content: line.content })),
    ),
  );
}

export async function recentCommits(cwd: string | undefined, limit: number): Promise<RepoCommit[]> {
  const log = await createGit(cwd).log({ maxCount: limit });
  return log.all.map((entry) => ({
    hash: entry.hash.slice(0, 8),
    message: entry.message,
    date: entry.date,
    author: entry.author_name,
  }));
}

export async function currentBranch(cwd?: string): Promise<string> {
  try {
    return await createGit(cwd).revparse(["--abbrev-ref", "HEAD"]);
  } catch {
    return "unknown";
  }
}

/** Persist generated artifacts under ~/.gitwhisper so the working tree stays clean. */
export async function writeArtifact(name: string, content: string): Promise<string> {
  const directory = join(homedir(), ".gitwhisper", "artifacts");
  await mkdir(directory, { recursive: true });
  const target = join(directory, name);
  await writeFile(target, content, "utf8");
  return target;
}
