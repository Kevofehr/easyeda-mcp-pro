#!/usr/bin/env tsx
import process from 'node:process';
import {
  diffRuntimeInventorySnapshots,
  readRuntimeInventorySnapshot,
  writeRuntimeInventoryDiff,
} from '../src/easyeda-runtime/inventory.js';

const [basePath, currentPath, outputPath] = process.argv.slice(2);

if (!basePath || !currentPath) {
  console.error(
    'Usage: pnpm inventory:diff <base-snapshot.json> <current-snapshot.json> [diff-output.json]',
  );
  process.exit(2);
}

const base = await readRuntimeInventorySnapshot(basePath);
const current = await readRuntimeInventorySnapshot(currentPath);
const diff = diffRuntimeInventorySnapshots(base, current);

if (outputPath) {
  await writeRuntimeInventoryDiff(outputPath, diff);
}

console.log(JSON.stringify(diff, null, 2));
if (diff.status === 'changed') {
  process.exitCode = 1;
}
