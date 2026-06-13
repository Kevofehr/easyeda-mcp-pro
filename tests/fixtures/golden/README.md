# Golden E2E Fixture: ESP32-S3 Sensor and Control Board

> **⚠️ REQUIRES LOCAL EasyEDA PRO** — This full E2E fixture requires a running
> EasyEDA Pro instance with the bridge extension installed and connected.
> It is **not** executed on GitHub-hosted CI runners.

## Overview

This directory contains the golden E2E fixture for validating a complete
EasyEDA Pro workflow — from schematic capture to manufacturing exports.

The fixture defines an **ESP32-S3 Sensor and Control Board** with:

- ESP32-S3-MINI-1-N8 (U1)
- CP2102N USB-to-UART Bridge (U2)
- XC6206P332MR 3.3V LDO Regulator (U3)
- BME280 Environmental Sensor (U4)
- W25Q128JVSIQ SPI Flash (U5)
- Status LEDs, passives, connectors, buttons, mounting holes

## Files

| File / Directory                 | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `fixture.json`                   | Golden fixture definition — the single source of truth |
| `fixture-schema.json`            | JSON Schema validating fixture structure               |
| `__tests__/golden-smoke.test.ts` | CI-safe smoke tests (no EasyEDA Pro required)          |
| `README.md`                      | This file — manual execution instructions              |

## Manual Execution (requires EasyEDA Pro)

### Prerequisites

1. **EasyEDA Pro** (version 2.x)
2. **Bridge extension** installed and enabled (version 0.4.0+)
3. **easyeda-mcp-pro server** running (version 0.4.0+)

### Environment Variables

Set these in your `.env` or shell before running:

```bash
# Required
TRANSPORT=http
HTTP_PORT=3000
EASYEDA_DEV_BRIDGE=false

# Optional: adjust for your environment
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=49620
LOG_LEVEL=info
```

### Steps

1. **Start the server:**

   ```bash
   pnpm build
   pnpm start
   ```

2. **Connect EasyEDA Pro to the bridge:**
   - Open EasyEDA Pro
   - Go to **Settings → Extensions → Extension Manager**
   - Ensure **MCP Pro Bridge** extension is enabled
   - Ensure **Allow External Interaction** is checked
   - Click **MCP Bridge → Connect**

3. **Verify bridge connection:**

   ```bash
   # Health check
   curl http://127.0.0.1:3000/healthz
   # Expected: {"status":"ok","version":"0.4.0"}
   ```

4. **Create a new project named** `ESP32-S3-Sensor-Board`

5. **Place components** as specified in `fixture.json` → `schematic.components`

6. **Wire named nets** as specified in `fixture.json` → `schematic.namedNets`

7. **Run validation commands** against the live board:

   ```bash
   # Capture schematic state
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"easyeda_schematic_components","arguments":{}}}'

   # Capture nets
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"easyeda_schematic_nets","arguments":{}}}'

   # Generate BOM
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"easyeda_bom_generate","arguments":{}}}'

   # Run ERC
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"easyeda_erc_run","arguments":{}}}'

   # Run DRC
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"5","method":"tools/call","params":{"name":"easyeda_drc_run","arguments":{}}}'

   # Export Gerbers
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"6","method":"tools/call","params":{"name":"easyeda_export_gerbers","arguments":{}}}'
   ```

8. **Capture outputs** by saving the tool results

9. **Compare against fixture expectations** in `fixture.json`

### Expected Outputs

| Check                | Expected Result                             |
| -------------------- | ------------------------------------------- |
| Schematic components | 28 components matching fixture definition   |
| Named nets           | 27 nets matching fixture definition         |
| BOM lines            | 18 lines matching fixture definition        |
| ERC errors           | 0 errors, ~2 warnings                       |
| DRC errors           | 0 errors, ~3 warnings                       |
| Export files         | 12 files (Gerbers, drill, BOM CSV, PnP CSV) |

### Troubleshooting

| Symptom                          | Likely Cause                           | Fix                                                    |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Bridge won't connect             | Extension not installed or disabled    | Re-import `.eext` file, enable extension               |
| Bridge disconnects after connect | Port mismatch                          | Verify `BRIDGE_PORT` matches EasyEDA Pro bridge config |
| ERC/DRC shows different errors   | Design not fully wired                 | Verify all named nets are connected                    |
| BOM line count differs           | Components not placed or duplicated    | Cross-check component list                             |
| Export fails                     | Project not saved or board not created | Save project, ensure PCB file exists                   |

## CI Smoke Tests

The `__tests__/golden-smoke.test.ts` suite runs on every PR without
EasyEDA Pro. It validates:

- Fixture file existence and parseability
- JSON Schema structural conformance
- Component ref uniqueness and format
- Net name uniqueness and node validity
- BOM structure and line count consistency
- ERC/DRC expected vs. max error ranges
- Export manifest format and file count
- Metadata completeness
- Cross-referencing consistency between sections

## Adding New Fixtures

1. Copy this directory as a template
2. Update `fixture.json` with the new board definition
3. Add smoke test assertions in `golden-smoke.test.ts`
4. Update this README with execution steps
5. Commit and push — CI will validate the new fixture structure
