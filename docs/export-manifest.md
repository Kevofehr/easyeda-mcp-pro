# Export Manifest

> Manifest schema, artifact type reference, and validation rules for export
> integrity checking.

## Overview

The export manifest is a structured metadata document generated alongside export
artifacts. It describes what was exported, when, by which tool, and enables
automated validation of completeness and integrity.

**Purpose:**

- Verify that all required export files were generated
- Detect empty, stale, or corrupted artifacts
- Track which tool version produced each artifact
- Enable CI-safe validation without a live EasyEDA Pro instance
- Provide a machine-readable audit trail for manufacturing handoff

## Manifest Schema

```typescript
interface ExportManifestInput {
  version: string; // Manifest schema version (semver)
  sourceProjectId: string; // EasyEDA project UUID
  sourceProjectName?: string; // Human-readable project name
  generatedAt: string; // ISO-8601 generation timestamp
  serverVersion?: string; // Server/tool version
  bridgeMetadata?: Record<string, unknown>; // EasyEDA bridge metadata
  artifacts: ExportManifestEntry[]; // Exported files
  expectedArtifacts?: ExpectedArtifact[]; // Expected file descriptors
}
```

### Artifact Entry

```typescript
interface ExportManifestEntry {
  filename: string; // File name (e.g. "ESP32-Board-F.Cu.gbr")
  relativePath?: string; // Path relative to export root
  fileType: ArtifactType; // Type (gerber, drill, bom, etc.)
  purpose: string; // Human-readable description
  sourceProject?: string; // Project UUID this artifact came from
  generatedByTool?: string; // Tool name (e.g. "easyeda-export-gerbers")
  timestamp?: string; // ISO-8601 generation time
  checksum?: string; // SHA-256 or MD5 checksum
  fileSize?: number; // Size in bytes
  required: boolean; // Whether this file is required
  stale: boolean; // Whether this artifact is outdated
}
```

### Expected Artifact

```typescript
interface ExpectedArtifact {
  filename: string; // Expected file name
  fileType: ArtifactType; // Expected file type
  minSizeBytes?: number; // Minimum acceptable size
  required?: boolean; // Whether missing = error (default: true)
}
```

## Artifact Types

| Enum Value   | Description                       | Example Extension |
| ------------ | --------------------------------- | ----------------- |
| `gerber`     | Gerber RS-274X fabrication layer  | `.gbr`            |
| `drill`      | NC drill file (Excellon format)   | `.drl`            |
| `bom`        | Bill of materials (CSV)           | `.csv`            |
| `pnp`        | Pick-and-place / centroid file    | `.csv`            |
| `pdf`        | PDF export (schematic or board)   | `.pdf`            |
| `netlist`    | Netlist (PADS / Allegro / Altium) | `.txt`, `.asc`    |
| `erc-report` | Electrical rules check report     | `.txt`, `.json`   |
| `drc-report` | Design rules check report         | `.txt`, `.json`   |

## Validation Rules

The module runs 10 validation rules against an `ExportManifestInput`:

| #   | Rule                   | Severity | Description                                                       |
| --- | ---------------------- | -------- | ----------------------------------------------------------------- |
| 1   | Invalid version        | error    | Manifest version must be valid semver (e.g. `1.0.0`)              |
| 2   | Missing source project | error    | `sourceProjectId` must be non-empty                               |
|     |                        | warning  | Each artifact should have `sourceProject`                         |
| 3   | Missing timestamp      | error    | `generatedAt` must be non-empty                                   |
|     |                        | warning  | Each artifact should have `timestamp`                             |
| 4   | Missing purpose        | warning  | Each artifact should have a human-readable `purpose`              |
| 5   | Empty file             | error    | Artifacts with `fileSize: 0` are rejected                         |
| 6   | Stale file             | warning  | Artifacts flagged `stale: true` need re-export                    |
| 7   | Checksum mismatch      | error    | When `checksum` uses `"expected:actual"` format and values differ |
| 8   | Missing required file  | error    | Required `expectedArtifacts` not found in `artifacts`             |
| 9   | Unexpected file        | warning  | Artifact in output but not in `expectedArtifacts`                 |
| 10  | Wrong file type        | error    | Artifact `fileType` doesn't match `expectedArtifacts` entry       |

### Validation Report

```typescript
interface ExportManifestReport {
  valid: boolean; // True if zero errors
  manifest: ExportManifestInput; // The validated manifest
  issues: ExportManifestIssue[]; // All issues found
  summary: ExportManifestSummary; // Aggregated counts
}

interface ExportManifestSummary {
  totalFiles: number;
  errors: number;
  warnings: number;
  missingRequired: number;
  emptyFiles: number;
  staleFiles: number;
  checksumMismatches: number;
  unexpectedFiles: number;
  wrongFileTypes: number;
  missingPurposes: number;
  missingTimestamps: number;
  missingSourceProjects: number;
}
```

## Usage

### Validating a manifest

```typescript
import { validateExportManifest } from './export-manifest/validation.js';

const result = validateExportManifest({
  version: '1.0.0',
  sourceProjectId: 'proj-abc-123',
  generatedAt: '2026-06-11T21:00:00.000Z',
  artifacts: [/* ... entries ... */],
  expectedArtifacts: [/* ... expectations ... */],
});

if (!result.valid) {
  console.error('Export validation failed:', result.summary);
  for (const issue of result.issues) {
    console.error(`  [${issue.severity}] ${issue.message}`);
  }
}
```

### Creating artifact entries

```typescript
import { ArtifactType } from './export-manifest/types.js';

const entry = {
  filename: 'ESP32-S3-Board-F.Cu.gbr',
  fileType: ArtifactType.Gerber,
  purpose: 'Top copper layer',
  sourceProject: 'proj-abc-123',
  generatedByTool: 'easyeda-export-gerbers',
  timestamp: new Date().toISOString(),
  fileSize: 4096,
  required: true,
  stale: false,
};
```

## CI-Safe Fixture Workflow

The validation module is designed to run without a live EasyEDA Pro instance.
Tests use fixture JSON files in `tests/fixtures/export-manifest/`:

```
tests/fixtures/export-manifest/
├── valid-manifest.json           # 6 artifacts, all correct
├── missing-required-file.json    # Missing expected gerber
├── empty-file.json               # Artifact with 0 bytes
├── stale-file.json               # Artifact flagged stale
├── checksum-mismatch.json        # Checksum expected:actual differs
├── wrong-file-type.json          # File type mismatch
├── invalid-version.json          # Bad semver
└── missing-metadata.json         # Empty source/timestamp/purpose
```

To add a new fixture:

1. Create a JSON file following the `ExportManifestInput` schema
2. Add a test that loads and validates it
3. Run `pnpm test` to confirm expected pass/fail behavior

## Manual EasyEDA Pro Export Workflow

When using EasyEDA Pro with the bridge extension:

1. Export Gerbers, BOM, PDF, etc. via the existing MCP tools
2. The export response includes `artifact_path` and `file_count`
3. Create a manifest object from the export results and any file system scan
4. Run `validateExportManifest()` to check completeness
5. Review warnings (stale files, unexpected files, missing metadata)
6. Fix errors (missing required files, empty files, checksum mismatches)

## Checksum Update Process

1. Export artifacts using your EDA tool
2. Compute checksums: `sha256sum <file>` (Linux/macOS) or `Get-FileHash <file>` (PowerShell)
3. Include checksums in the artifact entries
4. For comparison, use the `"expected:actual"` format — the module splits on `:`
   and reports mismatch when the two values differ
5. Update expected checksums in your test fixtures when source designs change

## Integration with Golden Fixture

The golden fixture in `tests/fixtures/golden/fixture.json` already includes an
`exportManifest` section with expected file counts, formats, and file-level
expectations. The `golden-smoke.test.ts` suite verifies:

- Expected file count matches
- Required formats are present (gerber, drill, bom_csv, pnp_csv, pdf_schematic, pdf_board, netlist)
- All filenames are unique
- Each file meets its `minSizeBytes` threshold

## Known Limitations

- **Checksum format**: The `"expected:actual"` convention is ad-hoc. A structured
  `{ expectedChecksum: string, actualChecksum: string }` field would be cleaner but
  is deferred for schema compatibility.
- **No real file I/O**: The module validates the manifest structure only — it does
  not read actual files from disk to verify sizes, existence, or checksums.
  External callers should pass the actual values obtained from the file system.
- **Semver strictness**: The version regex allows pre-release tags but does not
  support build metadata (`+` suffix). Extend `SEMVER_RE` in `validation.ts` if needed.
- **No cross-artifact deduplication**: If the same filename appears in multiple
  artifact entries, each is validated independently. Deduplication is caller responsibility.
- **Bridge-dependent fields**: `bridgeMetadata` is recorded if available but not
  validated — the module assumes the bridge provides accurate metadata.
