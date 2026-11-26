export type Severity = "critical" | "high" | "medium" | "low";

export interface SecretFinding {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  redacted: string;
  recommendation: string;
}

export interface RepoCommit {
  hash: string;
  message: string;
  date: string;
  author: string;
}

export interface RepoSummary {
  repository: string;
  branch: string;
  generatedAt: string;
  commits: RepoCommit[];
  velocity: Array<{ date: string; count: number }>;
  commitTypes: Array<{ label: string; value: number }>;
  topFiles: Array<{ path: string; changes: number }>;
  secretFindings: number;
  healthScore: number;
}

export interface ReviewResult {
  score: number;
  summary: string;
  findings: SecretFinding[];
  suggestions: string[];
  engine: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface ConfigView {
  provider: string;
  model: string;
  offline: boolean | string;
  ollamaHost: string;
  ollamaModel: string;
  demo: boolean;
  [key: string]: string | boolean;
}
