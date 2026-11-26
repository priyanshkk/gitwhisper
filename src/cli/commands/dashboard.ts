/** Local analytics dashboard command (`gitwhisper dashboard` / `gitwhisper ui`). */

import { exec } from "node:child_process";
import { intro, outro, spinner } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import { startDashboardServer } from "../../ui/server.js";
import { CliError, isInteractive } from "../shared.js";

function openBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, () => {
    // Opening a browser is a convenience, never a hard failure.
  });
}

export function dashboardCommand(): Command {
  return new Command("dashboard")
    .alias("ui")
    .description("launch the local web dashboard on http://localhost:4321")
    .option("-p, --port <port>", "port to listen on", "4321")
    .option("-C, --cwd <dir>", "repository to analyse")
    .option("-d, --demo", "serve realistic demo data")
    .option("--no-open", "do not open the browser automatically")
    .action(async (options) => {
      const port = Number(options.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new CliError(`Invalid port "${options.port}". Use a number between 1 and 65535.`);
      }

      intro(`${pc.bgCyan(pc.black(" GitWhisper "))} ${pc.bold("dashboard")}`);
      const task = spinner();
      task.start(pc.dim(`Starting local server on 127.0.0.1:${port}…`));
      const server = await startDashboardServer({
        cwd: options.cwd,
        port,
        demo: Boolean(options.demo),
      });
      task.stop(pc.green("Dashboard is live"));

      process.stdout.write(`\n  ${pc.bold("Open")}  ${pc.cyan(server.url)}\n`);
      process.stdout.write(`  ${pc.dim("Endpoints: /api/summary · /api/review · /api/config")}\n`);
      process.stdout.write(`  ${pc.dim("Bound to localhost only. Press Ctrl+C to stop.")}\n`);

      if (options.open !== false && isInteractive()) openBrowser(server.url);

      const shutdown = async () => {
        await server.close();
        outro(pc.green("Dashboard stopped."));
        process.exit(0);
      };
      process.once("SIGINT", () => void shutdown());
      process.once("SIGTERM", () => void shutdown());
    });
}
