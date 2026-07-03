import 'dotenv/config';
import {
  createDoctorReport,
  formatDoctorReport,
  formatHelp,
  formatSetupLocalReport,
  formatVersion,
  parseCliArgs,
} from './cli/local-setup.js';
import { runExtension, runSetup, runInteractiveInit } from './cli/auto-setup.js';
import type { SetupOptions } from './cli/client-definitions.js';
import { loadEnvConfig } from './config/env.js';
import { createServer } from './server/factory.js';
import { createHttpTransport } from './server/transports/http.js';

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.command === 'init') {
    await runInteractiveInit();
    return;
  }

  if (cli.command === 'setup') {
    process.stdout.write(
      `${runSetup({ client: cli.setupClient as SetupOptions['client'], profile: cli.setupProfile })}\n`,
    );
    return;
  }

  if (cli.command === 'extension') {
    process.stdout.write(`${runExtension({ open: cli.extensionOpen, copy: cli.extensionCopy })}\n`);
    return;
  }

  if (cli.command === 'setup-local') {
    process.stdout.write(`${formatSetupLocalReport()}\n`);
    return;
  }

  if (cli.command === 'doctor') {
    process.stdout.write(`${formatDoctorReport(await createDoctorReport())}\n`);
    return;
  }

  if (cli.command === 'help') {
    process.stdout.write(`${formatHelp()}\n`);
    return;
  }

  if (cli.command === 'version') {
    process.stdout.write(`${formatVersion()}\n`);
    return;
  }

  const config = loadEnvConfig();
  const instance = await createServer(config);

  if (config.TRANSPORT === 'http') {
    const httpTransport = createHttpTransport(config);
    instance.httpTransport = httpTransport;
    instance.transport = httpTransport.transport;
    await instance.server.connect(httpTransport.transport);
    await httpTransport.start();
  } else {
    await instance.server.connect(instance.transport);
  }

  process.stderr.write(`easyeda-mcp-pro ready on ${config.TRANSPORT} transport\n`);

  let exiting = false;
  const shutdown = async () => {
    await instance.httpTransport?.close();
    await instance.shutdown();
  };
  const exitCleanly = (why: string, code = 0) => {
    if (exiting) return;
    exiting = true;
    process.stderr.write(`easyeda-mcp-pro: ${why}; shutting down\n`);
    void shutdown().finally(() => process.exit(code));
  };

  process.once('SIGINT', () => exitCleanly('SIGINT'));
  process.once('SIGTERM', () => exitCleanly('SIGTERM'));

  // stdio: exit when the parent (the MCP client) disconnects. Signals are not
  // reliably delivered to stdio children — especially on Windows — so a closed
  // stdin is the authoritative "parent is gone" trigger. Exiting here stops the
  // server from lingering as a zombie that squats the bridge port and gets
  // hijacked by the next session's extension scan.
  if (config.TRANSPORT !== 'http') {
    process.stdin.once('end', () => exitCleanly('stdin ended (parent disconnected)'));
    process.stdin.once('close', () => exitCleanly('stdin closed (parent disconnected)'));
    const transport = instance.transport as { onclose?: () => void } | undefined;
    if (transport) {
      const previousOnClose = transport.onclose;
      transport.onclose = () => {
        previousOnClose?.();
        exitCleanly('stdio transport closed (parent disconnected)');
      };
    }
  }

  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`Unhandled rejection: ${reason}\n`);
  });
  process.on('uncaughtException', (err) => {
    process.stderr.write(`Uncaught exception: ${err}\n`);
    process.exit(1);
  });
}

main().catch((err) => {
  process.stderr.write(`Critical server error: ${err}\n`);
  process.exit(1);
});
