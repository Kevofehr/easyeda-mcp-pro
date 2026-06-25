import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CHECKSUM_MANIFEST_NAME, verifyChecksumManifest } from './checksums.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const required = ['dist/index.js', 'extension.json', 'images/logo.png'];

let ok = true;
for (const f of required) {
  const p = join(root, f);
  if (!existsSync(p)) {
    console.error(`MISSING: ${f}`);
    ok = false;
  } else {
    const size = statSync(p).size;
    if (size === 0) {
      console.error(`EMPTY FILE: ${f}`);
      ok = false;
    } else {
      console.log(`OK: ${f} (${size} bytes)`);
    }
  }
}

const manifestPath = join(root, 'extension.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entry = typeof manifest.entry === 'string' ? manifest.entry : '';
const normalizedEntry = entry.replace(/^\.\//, '');
const entryCandidates = [normalizedEntry, `${normalizedEntry}.js`];
if (!entry || !entryCandidates.some((candidate) => existsSync(join(root, candidate)))) {
  console.error(`INVALID ENTRY: ${entry || '<missing>'}`);
  ok = false;
} else {
  console.log(`OK: manifest entry (${entry})`);
}

const packagePath = join(root, '..', 'easyeda-bridge-extension.eext');
const checksumPath = join(root, '..', CHECKSUM_MANIFEST_NAME);
if (!existsSync(packagePath)) {
  console.error('MISSING: easyeda-bridge-extension.eext');
  ok = false;
}
if (!existsSync(checksumPath)) {
  console.error(`MISSING: ${CHECKSUM_MANIFEST_NAME}`);
  ok = false;
}
if (existsSync(packagePath) && existsSync(checksumPath)) {
  const result = await verifyChecksumManifest({ root, packagePath, manifestPath: checksumPath });
  if (!result.ok) {
    for (const error of result.errors) console.error(`CHECKSUM: ${error}`);
    ok = false;
  } else {
    console.log(`OK: ${CHECKSUM_MANIFEST_NAME}`);
  }
}

if (!ok) process.exit(1);
console.log('\nDist verification successful ✓');
