#!/usr/bin/env node
// Screenshot return-path decoder for the easyeda MCP bridge.
//
// The bridge cannot serialize a Blob, so a canvas screenshot is captured with
// `easyeda_execute` running this JS in EasyEDA Pro:
//
//   const blob = await eda.dmt_EditorControl.getCurrentRenderedAreaImage();
//   const bytes = new Uint8Array(await blob.arrayBuffer());
//   let bin=''; for (let i=0;i<bytes.length;i+=8192) bin += String.fromCharCode.apply(null, bytes.subarray(i,i+8192));
//   return { ok:true, mime: blob.type, size: bytes.length, base64: btoa(bin) };
//
// The execute result (large) is written to a tool-results file. This script
// finds the newest execute result containing base64 and decodes it to a PNG.
//
// Usage: node decode-screenshot.mjs <tool-results-dir> <out.png>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] || 'easyeda-screenshot.png';
if (!dir) {
  console.error('usage: node decode-screenshot.mjs <tool-results-dir> <out.png>');
  process.exit(1);
}

const candidates = fs
  .readdirSync(dir)
  .filter((f) => f.includes('easyeda_execute') && f.endsWith('.txt'))
  .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

for (const { f } of candidates) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const r = j.result || j;
    if (r && r.base64) {
      fs.writeFileSync(out, Buffer.from(r.base64, 'base64'));
      console.log(`decoded ${f} -> ${out} (${r.size ?? '?'} bytes, ${r.mime ?? '?'})`);
      process.exit(0);
    }
  } catch {
    /* not JSON / not a screenshot result — keep looking */
  }
}
console.error('no execute result with base64 found in ' + dir);
process.exit(1);
