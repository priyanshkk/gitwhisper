import { describe, expect, it } from "vitest";
import { DEMO_STRIPE_KEY, parseDiff } from "../src/core/git";
import { countBySeverity, redact, scanDiff, scanText, shannonEntropy } from "../src/core/scanner";

const AWS_KEY = "AKIAQWERTYUIOPASDFGH";
const GITHUB_TOKEN = `ghp_${"a1".repeat(18)}`;
const OPENAI_KEY = `sk-proj-${"b2".repeat(15)}`;
const STRIPE_KEY = DEMO_STRIPE_KEY;
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("shannonEntropy", () => {
  it("returns zero for repeated characters and two bits for four distinct symbols", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("abcd")).toBe(2);
  });

  it("scores a random-looking token above the detection threshold", () => {
    expect(shannonEntropy("aB3!xQ9@zL7#pK2")).toBeGreaterThan(3.5);
  });
});

describe("redact", () => {
  it("keeps only the edges of a secret", () => {
    const masked = redact(STRIPE_KEY);
    expect(masked.startsWith("sk_l")).toBe(true);
    expect(masked.endsWith(STRIPE_KEY.slice(-3))).toBe(true);
    expect(masked).not.toContain(STRIPE_KEY.slice(4, -4));
    expect(masked).toContain("•");
  });

  it("fully masks very short values", () => {
    expect(redact("abc")).toBe("•••");
  });
});

describe("scanText", () => {
  it("detects AWS access keys", () => {
    const findings = scanText(`const key = "${AWS_KEY}";`, "aws.ts", 4);
    expect(
      findings.some(
        (finding) => finding.rule === "aws-access-key" && finding.severity === "critical",
      ),
    ).toBe(true);
    expect(findings[0]?.file).toBe("aws.ts");
  });

  it("detects GitHub, OpenAI and Stripe credentials", () => {
    const findings = scanText([GITHUB_TOKEN, OPENAI_KEY, STRIPE_KEY].join("\n"), "keys.ts", 9);
    const rules = new Set(findings.map((finding) => finding.rule));
    expect(rules.has("github-token")).toBe(true);
    expect(rules.has("openai-key")).toBe(true);
    expect(rules.has("stripe-live-key")).toBe(true);
  });

  it("detects private keys and JWTs", () => {
    const findings = scanText(`-----BEGIN RSA PRIVATE KEY-----\n${JWT}`, "auth.ts", 2);
    expect(findings.some((finding) => finding.rule === "private-key")).toBe(true);
    expect(findings.some((finding) => finding.rule === "jwt")).toBe(true);
  });

  it("detects generic passwords and high-entropy quoted literals", () => {
    const findings = scanText(
      'const password = "Tr0ub4dor&3xK9";\nconst blob = "aB3xQ9zL7pK2mVnT4rW8yD6sF1hG5j";',
      "config.ts",
      12,
    );
    expect(findings.some((finding) => finding.rule === "generic-credential")).toBe(true);
    expect(findings.some((finding) => finding.rule === "high-entropy-literal")).toBe(true);
  });

  it("ignores environment variables, placeholders and test keys", () => {
    const findings = scanText(
      [
        "const key = process.env.API_KEY;",
        'const token = "your_key_here";',
        'const secret = "changeme123";',
        'const id = "example";',
      ].join("\n"),
      "safe.ts",
      1,
    );
    expect(findings).toHaveLength(0);
  });

  it("deduplicates identical findings on one line", () => {
    const findings = scanText(`const a = "${AWS_KEY}"; const b = "${AWS_KEY}";`, "dup.ts", 3);
    expect(findings.filter((finding) => finding.rule === "aws-access-key")).toHaveLength(1);
  });
});

describe("scanDiff", () => {
  it("inspects only added lines", () => {
    const diff = `diff --git a/config.ts b/config.ts
--- a/config.ts
+++ b/config.ts
@@ -1,2 +1,2 @@
-const oldKey = "${AWS_KEY}";
+const safe = 42;
`;
    expect(scanDiff(parseDiff(diff))).toHaveLength(0);
  });

  it("finds the demo Stripe key on added lines", () => {
    const diff = `diff --git a/payments.ts b/payments.ts
--- a/payments.ts
+++ b/payments.ts
@@ -0,0 +1 @@
+const key = "${STRIPE_KEY}";
`;
    const findings = scanDiff(parseDiff(diff));
    expect(findings.some((finding) => finding.rule === "stripe-live-key")).toBe(true);
    expect(findings.every((finding) => !finding.redacted.includes(STRIPE_KEY.slice(4)))).toBe(true);
  });
});

describe("countBySeverity", () => {
  it("counts findings grouped by severity", () => {
    const findings = scanText(`${AWS_KEY}\n${GITHUB_TOKEN}\nAIza${"a".repeat(35)}`, "all.ts", 1);
    const counts = countBySeverity(findings);
    expect(counts.critical).toBeGreaterThanOrEqual(2);
    expect(counts.high).toBeGreaterThanOrEqual(1);
    expect(counts.low).toBe(0);
  });
});
