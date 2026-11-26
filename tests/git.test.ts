import { describe, expect, it } from "vitest";
import { DEMO_DIFF, DEMO_STRIPE_KEY, addedLines, chunkDiff, parseDiff } from "../src/core/git";

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,4 +10,5 @@ export function app() {
   const old = 1;
-  return old;
+  const next = old + 1;
+  return next;
 }
diff --git a/docs/guide.md b/docs/guide.md
new file mode 100644
--- /dev/null
+++ b/docs/guide.md
@@ -0,0 +1,2 @@
+# Guide
+Usage notes.
`;

describe("parseDiff", () => {
  it("parses multiple files with correct paths and counts", () => {
    const parsed = parseDiff(SIMPLE_DIFF);
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[0]?.path).toBe("src/app.ts");
    expect(parsed.files[0]?.additions).toBe(2);
    expect(parsed.files[0]?.deletions).toBe(1);
    expect(parsed.files[1]?.path).toBe("docs/guide.md");
    expect(parsed.totalAdditions).toBe(4);
    expect(parsed.totalDeletions).toBe(1);
  });

  it("tracks new-file line numbers from the hunk header", () => {
    const parsed = parseDiff(SIMPLE_DIFF);
    const lines = addedLines(parsed).filter((line) => line.file === "docs/guide.md");
    expect(lines.map((line) => line.line)).toEqual([1, 2]);
    expect(lines[1]?.content).toBe("Usage notes.");
  });

  it("parses the bundled demo diff used by --demo", () => {
    const parsed = parseDiff(DEMO_DIFF);
    expect(parsed.files.map((file) => file.path)).toEqual([
      "src/services/payments.ts",
      "src/services/payments.test.ts",
      "README.md",
    ]);
    expect(parsed.totalAdditions).toBe(30);
    expect(parsed.raw).toContain(DEMO_STRIPE_KEY);
  });

  it("handles an empty diff without throwing", () => {
    const parsed = parseDiff("");
    expect(parsed.files).toEqual([]);
    expect(parsed.totalAdditions).toBe(0);
    expect(parsed.totalDeletions).toBe(0);
  });

  it("flags very large diffs as truncated metadata", () => {
    const huge = `${SIMPLE_DIFF}${"x".repeat(60_001)}`;
    expect(parseDiff(huge).truncated).toBe(true);
  });
});

describe("addedLines", () => {
  it("returns only additions with file and line metadata", () => {
    const lines = addedLines(parseDiff(SIMPLE_DIFF));
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.content.length > 0 || line.content === "")).toBe(true);
    expect(lines.some((line) => line.content === "  const next = old + 1;")).toBe(true);
  });
});

describe("chunkDiff", () => {
  it("keeps whole files together across model-friendly chunks", () => {
    const chunks = chunkDiff(parseDiff(DEMO_DIFF), 800);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.startsWith("diff --git"))).toBe(true);
    expect(chunks.join("\n")).toContain("src/services/payments.test.ts");
    expect(chunks.join("\n")).toContain("README.md");
  });

  it("returns the raw diff when no files were parsed", () => {
    expect(chunkDiff(parseDiff(""))).toEqual([""]);
  });
});
