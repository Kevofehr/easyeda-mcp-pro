# EasyEDA Runtime Inventory

The runtime inventory workflow captures the EasyEDA Pro API surface exposed to the bridge extension and compares snapshots across EasyEDA Pro releases or extension builds.

## Capture a snapshot

Snapshot capture is opt-in and requires a live EasyEDA Pro session with the bridge extension connected.

```bash
EASYEDA_RUNTIME_INVENTORY_CAPTURE=true \
EASYEDA_RUNTIME_INVENTORY_PATH=.easyeda-mcp-pro/runtime-inventory/easyeda-2026.1.json \
pnpm inventory:capture
```

Optional settings:

```bash
EASYEDA_RUNTIME_INVENTORY_FILTER=sch
EASYEDA_RUNTIME_INVENTORY_TIMEOUT_MS=30000
```

When capture is not enabled, `pnpm inventory:capture` exits successfully without contacting EasyEDA. This keeps normal CI independent from a live desktop runtime.

## Diff snapshots

Compare two saved snapshots offline:

```bash
pnpm inventory:diff baseline.json current.json .easyeda-mcp-pro/runtime-inventory/diff.json
```

The diff command prints JSON and returns exit code `1` when the runtime API surface changed. Use this in release checklists to force a human review of added, removed, or changed runtime methods.

## Snapshot schema

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-25T00:00:00.000Z",
  "easyedaVersion": "2026.1",
  "bridgeVersion": "0.5.3",
  "methodRegistryHash": "0123456789abcdef",
  "total": 1,
  "classes": [
    {
      "className": "SCH_Document",
      "runtimePaths": ["eda.SCH_Document"],
      "methods": ["save"]
    }
  ]
}
```

## Release use

Before declaring compatibility with a new EasyEDA Pro version:

1. Capture a runtime inventory snapshot from a disposable project.
2. Diff it against the last known-compatible snapshot.
3. Review removed classes or removed methods as possible breaking changes.
4. Review added methods as candidates for new tools or richer diagnostics.
5. Record the snapshot path, EasyEDA version, bridge version, and method registry hash in the release notes.

## Safety model

Inventory capture is read-only. It calls `system.apiInventory` through the bridge and does not mutate schematic, PCB, BOM, or project state.
