import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EasyedaApiMethodSchema } from '../../../src/bridge/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dispatcherSourcePath = resolve(
  __dirname,
  '../../../easyeda-bridge-extension/src/dispatcher.ts',
);
// The fork answers 17 methods at the LOADER level (index.ts), not in the
// dispatcher registry. They are still part of the bridge's public method
// surface, so the server enum must carry them too.
const loaderSourcePath = resolve(__dirname, '../../../easyeda-bridge-extension/src/index.ts');

/**
 * Read a `const <name> ... = [ 'a', 'b' ];` array of string literals out of an
 * extension source file. The extension sources are browser-runtime modules with
 * top-level side effects, so the repo convention (see
 * tests/unit/easyeda-runtime/extension-method-compat.test.ts) is to parse them
 * as text rather than import them.
 */
function extractStringArray(source: string, constName: string, label: string): string[] {
  const match = source.match(new RegExp(`const ${constName}[\\s\\S]*?= \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not locate ${label}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function extractDispatcherMethodList(source: string): string[] {
  return extractStringArray(source, 'METHOD_LIST:', 'dispatcher METHOD_LIST');
}

function extractLocalExtensionMethods(source: string): string[] {
  return extractStringArray(source, 'LOCAL_EXTENSION_METHODS', 'loader LOCAL_EXTENSION_METHODS');
}

describe('extension dispatcher method registry parity', () => {
  it('matches the server EasyedaApiMethodSchema exactly', () => {
    const dispatcherMethods = extractDispatcherMethodList(
      readFileSync(dispatcherSourcePath, 'utf8'),
    );
    const loaderMethods = extractLocalExtensionMethods(readFileSync(loaderSourcePath, 'utf8'));
    const serverMethods = [...EasyedaApiMethodSchema.options];

    // Upstream invariant: the dispatcher registry itself carries no duplicates.
    expect(new Set(dispatcherMethods).size).toBe(dispatcherMethods.length);
    // Same invariant for the fork's loader-level set.
    expect(new Set(loaderMethods).size).toBe(loaderMethods.length);

    // The two sets are disjoint: a method is answered either by the dispatcher
    // or by the loader, never both (the loader intercepts before dispatch, so an
    // overlap would silently shadow a dispatcher handler).
    const dispatcherSet = new Set(dispatcherMethods);
    expect(loaderMethods.filter((method) => dispatcherSet.has(method))).toEqual([]);

    // Full bridge surface == dispatcher registry + loader-level methods, and it
    // must equal the server enum exactly in BOTH directions.
    const bridgeMethods = [...dispatcherMethods, ...loaderMethods];
    expect(new Set(bridgeMethods).size).toBe(bridgeMethods.length);
    expect([...bridgeMethods].sort()).toEqual([...serverMethods].sort());
  });
});
