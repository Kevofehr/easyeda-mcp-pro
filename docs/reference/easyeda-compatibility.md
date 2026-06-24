# EasyEDA Pro Compatibility

This project supports EasyEDA Pro through the local bridge extension. Because EasyEDA Pro runtime APIs can change independently from this package, compatibility must be verified against a real EasyEDA Pro session before declaring a release production-ready.

## Compatibility status model

| Status           | Meaning                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `planned`        | Coverage is designed but no live smoke result has been recorded.       |
| `read-only-pass` | Read-only live smoke checks passed against a real EasyEDA Pro session. |
| `write-pass`     | Explicit opt-in write checks passed against a disposable test project. |
| `blocked`        | A runtime API mismatch or bridge issue blocks compatibility.           |

## Live smoke command

The smoke harness is opt-in and skipped by default, so normal CI does not require EasyEDA Pro.

```bash
pnpm smoke:easyeda
```

The default command exits successfully and writes a skipped report to:

```text
.easyeda-mcp-pro/live-smoke-report.json
```

To run live read-only checks, open EasyEDA Pro with the bridge extension installed, then run:

```bash
EASYEDA_LIVE_TESTS=true \
EASYEDA_TEST_PROJECT_ID=<disposable-project-id> \
pnpm smoke:easyeda
```

Optional settings:

```bash
EASYEDA_LIVE_REPORT_PATH=.easyeda-mcp-pro/live-smoke-report.json
EASYEDA_LIVE_TIMEOUT_MS=30000
```

Write checks are disabled by default. They must only be run against a disposable test project:

```bash
EASYEDA_LIVE_TESTS=true \
EASYEDA_TEST_PROJECT_ID=<disposable-project-id> \
EASYEDA_LIVE_WRITE_TESTS=true \
pnpm smoke:easyeda
```

## Read-only smoke coverage

| Check                       | Bridge method              | Mutates design state |
| --------------------------- | -------------------------- | -------------------- |
| System status               | `system.getStatus`         | No                   |
| Runtime API inventory       | `system.apiInventory`      | No                   |
| Schematic net listing       | `schematic.listNets`       | No                   |
| Schematic component listing | `schematic.listComponents` | No                   |
| BOM generation              | `bom.generate`             | No                   |
| ERC check                   | `design.erc`               | No                   |

## Explicit write coverage

| Check        | Bridge method  | Guard                                                              |
| ------------ | -------------- | ------------------------------------------------------------------ |
| Project save | `project.save` | Requires `EASYEDA_LIVE_WRITE_TESTS=true` and a disposable project. |

## Report fields

The JSON report includes:

- status: `skipped`, `passed`, or `failed`
- EasyEDA version reported by the bridge handshake
- bridge extension/server version
- method registry hash
- whether write checks were enabled
- individual check duration and failure messages

## Release rule

A release can pass normal CI without live EasyEDA. However, before tagging a release as EasyEDA Pro compatible, attach the latest live smoke report to the release checklist and record the EasyEDA Pro version in the compatibility matrix.

## Matrix

| EasyEDA Pro version | Bridge extension version | Smoke mode | Status  | Report                                  |
| ------------------- | ------------------------ | ---------- | ------- | --------------------------------------- |
| TBD                 | TBD                      | read-only  | planned | Run `pnpm smoke:easyeda` with live env. |
| TBD                 | TBD                      | write      | planned | Run only against a disposable project.  |
