/** Pre-push security review command. */

import { confirm, intro, outro, spinner } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import { parseDiff } from "../../core/git.js";
import { reviewChanges } from "../../core/insights.js";
import { countBySeverity, scanDiff } from "../../core/scanner.js";
import {
  abortIfCancelled,
  addCommonOptions,
  isInteractive,
  loadDiff,
  printJson,
  renderFindings,
  renderScore,
  resolveConfig,
  saveOutput,
  severityCounts,
} from "../shared.js";

export function reviewCommand(): Command {
  return addCommonOptions(new Command("review"))
    .description("scan staged changes for secrets and generate an AI code review")
    .option("-y, --yes", "do not ask before continuing when findings exist")
    .option("-o, --output <file>", "write the JSON report to a file")
    .action(async (options) => {
      const config = await resolveConfig(options);
      const raw = await loadDiff(options);
      const parsed = parseDiff(raw);
      const findings = scanDiff(parsed);

      if (!options.json) {
        intro(
          `${pc.bgCyan(pc.black(" GitWhisper "))} ${pc.bold("review")} ${pc.dim(`· ${options.demo ? "demo mode" : config.provider}`)}`,
        );
      } else if (!options.demo) {
        // Keep JSON stdout clean: no progress output at all.
      }

      const task = spinner();
      if (!options.json)
        task.start(pc.dim("Scanning added lines with 10 secret rules + entropy analysis…"));
      const result = await reviewChanges(config, parsed, findings, Boolean(options.demo));
      if (!options.json) task.stop(pc.green("Local secret scan complete"));

      const payload = {
        ...result,
        demo: Boolean(options.demo),
        counts: countBySeverity(findings),
        engine: result.engine,
      };

      if (options.json) {
        printJson(payload);
      } else {
        process.stdout.write(`\n${pc.bold("Security guard")}  ${severityCounts(findings)}\n`);
        process.stdout.write(`${renderFindings(findings)}\n\n`);
        process.stdout.write(`${pc.bold("Review score")}  ${renderScore(result.score)}\n`);
        process.stdout.write(`${pc.dim(result.summary)}\n\n`);
        process.stdout.write(`${pc.bold("Suggestions")}\n`);
        result.suggestions.forEach((suggestion, index) => {
          process.stdout.write(`  ${pc.cyan(`${index + 1}.`)} ${suggestion}\n`);
        });
        process.stdout.write(
          `\n${pc.dim(`Diff: ${parsed.files.length} files · ${parsed.totalAdditions} additions · ${parsed.totalDeletions} deletions`)}\n`,
        );
        process.stdout.write(
          `${pc.dim(`Engine: ${result.engine}${options.demo ? " · demo data, no files touched" : ""}`)}\n`,
        );
      }

      const target = await saveOutput(
        `${JSON.stringify(payload, null, 2)}\n`,
        options.output,
        `review-${Date.now()}.json`,
        Boolean(options.demo),
      );
      if (options.output) process.stdout.write(`${pc.dim(`Report saved: ${target}`)}\n`);

      const blocking = findings.some(
        (finding) => finding.severity === "critical" || finding.severity === "high",
      );
      if (blocking && !options.demo && !options.yes) {
        if (!options.json && isInteractive()) {
          const proceed = abortIfCancelled(
            await confirm({
              message: pc.yellow("High-risk findings detected. Continue anyway?"),
              initialValue: false,
            }),
          );
          if (!proceed) {
            outro(pc.red("Blocked — rotate the exposed credential before pushing."));
            process.exitCode = 1;
            return;
          }
        } else if (!options.json) {
          process.exitCode = 1;
        }
      }

      if (!options.json)
        outro(pc.green(options.demo ? "Demo complete — GitWhisper is working." : "Review ready."));
    });
}
