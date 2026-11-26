#!/usr/bin/env node
/** GitWhisper CLI entry point. */

import { Command } from "commander";
import pc from "picocolors";
import { commitCommand } from "./commands/commit.js";
import { configCommand } from "./commands/config.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { prCommand } from "./commands/pr.js";
import { reviewCommand } from "./commands/review.js";
import { handleFatal } from "./shared.js";

const program = new Command();

program
  .name("gitwhisper")
  .description(
    `${pc.bold("GitWhisper")} — catch leaked secrets, write clean commits, generate PR summaries.`,
  )
  .version("0.1.0", "-v, --version")
  .addHelpText(
    "after",
    `\nExamples:\n  ${pc.dim("gw review --demo")}          Try it instantly, no API key needed\n  ${pc.dim("gw commit")}                Draft and create a Conventional Commit\n  ${pc.dim("gw pr")}                   Generate a PR body with a Mermaid diagram\n  ${pc.dim("gw ui --demo")}             Open the local dashboard at localhost:4321\n  ${pc.dim("gw config --provider gemini --api-key KEY")}\n`,
  );

program.addCommand(reviewCommand());
program.addCommand(commitCommand());
program.addCommand(prCommand());
program.addCommand(configCommand());
program.addCommand(dashboardCommand());

if (process.argv.length === 2) program.outputHelp();

await program.parseAsync(process.argv).catch(handleFatal);
