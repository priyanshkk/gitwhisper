/** AI-assisted conventional commit command. */

import { confirm, intro, outro, select, spinner, text } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import { createGit, parseDiff } from "../../core/git.js";
import { suggestCommit } from "../../core/insights.js";
import { scanDiff } from "../../core/scanner.js";
import {
  abortIfCancelled,
  addCommonOptions,
  isInteractive,
  loadDiff,
  printJson,
  renderFindings,
  resolveConfig,
  saveOutput,
} from "../shared.js";

export function commitCommand(): Command {
  return addCommonOptions(new Command("commit"))
    .description("write a clean Conventional Commit from the staged diff")
    .option("-y, --yes", "accept the suggestion and commit without asking")
    .option("--dry-run", "show the message without creating a commit")
    .option("-o, --output <file>", "save the generated message to a file")
    .action(async (options) => {
      const config = await resolveConfig(options);
      const raw = await loadDiff(options, "staged");
      const parsed = parseDiff(raw);
      const findings = scanDiff(parsed);

      if (!options.json) {
        intro(
          `${pc.bgCyan(pc.black(" GitWhisper "))} ${pc.bold("commit")} ${pc.dim(`· ${options.demo ? "demo mode" : config.provider}`)}`,
        );
      }

      const task = spinner();
      if (!options.json) task.start(pc.dim("Reading diff and drafting a conventional commit…"));
      const suggestion = await suggestCommit(config, parsed, findings, Boolean(options.demo));
      if (!options.json) task.stop(pc.green("Commit message drafted"));

      if (findings.length && !options.json) {
        process.stdout.write(`\n${pc.bold("Secret guard")}\n${renderFindings(findings, 4)}\n`);
      }

      if (options.json) {
        printJson({
          suggestion,
          demo: Boolean(options.demo),
          committed: false,
          dryRun: Boolean(options.dryRun),
        });
        return;
      }

      process.stdout.write(
        `\n${pc.bold("Suggested commit")}\n${pc.bgBlack(pc.green(` ${suggestion.message.split("\n")[0]} `))}\n`,
      );
      if (suggestion.body.length) {
        for (const line of suggestion.body) process.stdout.write(`${pc.dim(`  ${line}`)}\n`);
      }
      process.stdout.write(
        `${pc.dim(`Confidence: ${Math.round(suggestion.confidence * 100)}% · engine: ${suggestion.engine}`)}\n`,
      );

      if (options.dryRun) {
        outro(pc.yellow("Dry run — no commit created."));
        return;
      }
      if (options.demo) {
        outro(pc.green("Demo complete — no repository changes made."));
        return;
      }

      const blocking = findings.some(
        (finding) => finding.severity === "critical" || finding.severity === "high",
      );
      if (blocking && !options.yes) {
        process.exitCode = 1;
        outro(pc.red("Commit blocked: rotate the exposed credential or pass --yes to override."));
        return;
      }

      let message = suggestion.message;
      let shouldCommit = Boolean(options.yes);

      if (!options.yes && isInteractive()) {
        const action = abortIfCancelled(
          await select({
            message: "What should GitWhisper do?",
            options: [
              { value: "commit", label: "Commit now", hint: "git commit with this message" },
              { value: "edit", label: "Edit message", hint: "type your own subject line" },
              { value: "copy", label: "Just save it", hint: "write the message, skip git" },
              { value: "cancel", label: "Cancel", hint: "make no changes" },
            ],
          }),
        );

        if (action === "cancel") {
          outro(pc.yellow("Cancelled — nothing was committed."));
          return;
        }
        if (action === "edit") {
          message = abortIfCancelled(
            await text({
              message: "Commit subject:",
              placeholder: "feat(scope): describe the change",
              defaultValue: suggestion.message.split("\n")[0],
              validate: (value) =>
                String(value).trim() ? undefined : "A commit message is required.",
            }),
          );
        }
        shouldCommit = action === "commit" || action === "edit";
        if (action === "edit") {
          const confirmed = abortIfCancelled(
            await confirm({ message: "Create the commit with this message?", initialValue: true }),
          );
          shouldCommit = confirmed;
        }
      } else if (!options.yes) {
        outro(pc.dim("Non-interactive run: pass --yes to create the commit."));
      }

      const target = await saveOutput(
        `${message}\n`,
        options.output,
        `commit-${Date.now()}.txt`,
        false,
      );
      if (options.output) process.stdout.write(`${pc.dim(`Message saved: ${target}`)}\n`);

      if (shouldCommit) {
        const git = createGit(options.cwd);
        await git.commit(message);
        outro(pc.green("Committed. Your history just got cleaner."));
      } else {
        outro(pc.green("Message ready."));
      }
    });
}
