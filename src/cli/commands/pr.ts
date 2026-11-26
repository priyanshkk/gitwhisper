/** Pull request title, changelog and impact summary command. */

import { intro, outro, spinner } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import { parseDiff, recentCommits } from "../../core/git.js";
import { draftPullRequest, formatPrMarkdown } from "../../core/insights.js";
import { scanDiff } from "../../core/scanner.js";
import type { RepoCommit } from "../../core/types.js";
import {
  addCommonOptions,
  loadDiff,
  printJson,
  renderFindings,
  resolveConfig,
  saveOutput,
} from "../shared.js";

export function prCommand(): Command {
  return addCommonOptions(new Command("pr"))
    .description("generate a PR title, changelog, risk list and Mermaid impact diagram")
    .option("-o, --output <file>", "save the Markdown body to a file")
    .action(async (options) => {
      const config = await resolveConfig(options);
      const raw = await loadDiff(options);
      const parsed = parseDiff(raw);
      const findings = scanDiff(parsed);

      let commits: RepoCommit[] = [];
      if (!options.demo) {
        try {
          commits = await recentCommits(options.cwd, 8);
        } catch {
          commits = [];
        }
      }

      if (!options.json) {
        intro(
          `${pc.bgCyan(pc.black(" GitWhisper "))} ${pc.bold("pr")} ${pc.dim(`· ${options.demo ? "demo mode" : config.provider}`)}`,
        );
      }

      const task = spinner();
      if (!options.json) task.start(pc.dim("Turning commits and diff into a review-ready PR…"));
      const draft = await draftPullRequest(
        config,
        parsed,
        commits.map((commit) => `${commit.hash} ${commit.message}`),
        findings,
        Boolean(options.demo),
      );
      if (!options.json) task.stop(pc.green("PR draft ready"));

      if (options.json) {
        printJson({ ...draft, demo: Boolean(options.demo), findings });
      } else {
        if (findings.length) {
          process.stdout.write(`\n${pc.bold("Security notes")}\n${renderFindings(findings, 3)}\n`);
        }
        process.stdout.write(`\n${pc.bold(pc.cyan(`  ${draft.title}  `))}\n\n`);
        process.stdout.write(`${draft.summary}\n\n`);
        process.stdout.write(`${pc.bold("Changes")}\n`);
        for (const item of draft.changes) process.stdout.write(`  ${pc.dim("•")} ${item}\n`);
        process.stdout.write(`\n${pc.bold("Testing")}\n`);
        for (const item of draft.testing) process.stdout.write(`  ${pc.green("✓")} ${item}\n`);
        process.stdout.write(`\n${pc.bold("Risks")}\n`);
        for (const item of draft.risks) process.stdout.write(`  ${pc.yellow("!")} ${item}\n`);
        process.stdout.write(`\n${pc.bold("Impact")}\n${pc.dim(draft.mermaid)}\n`);
        process.stdout.write(`\n${pc.dim(`Engine: ${draft.engine}`)}\n`);
      }

      const markdown = formatPrMarkdown(draft);
      const target = await saveOutput(
        markdown,
        options.output,
        `pr-${Date.now()}.md`,
        Boolean(options.demo),
      );
      if (!options.json && (options.output || !options.demo))
        process.stdout.write(`${pc.dim(`PR body saved: ${target}`)}\n`);
      if (!options.json)
        outro(
          pc.green(
            options.demo
              ? "Demo complete — no files touched."
              : "PR description saved. Paste it into GitHub.",
          ),
        );
    });
}
