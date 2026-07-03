/**
 * Export manifest — validation rules and entry point.
 *
 * Implements 10 validation rules that operate on {@link ExportManifestInput}
 * and produce structured {@link ExportManifestIssue}s.
 *
 * Rules:
 *  1. Invalid manifest version  — error if version is not valid semver
 *  2. Missing source project    — error if sourceProjectId is empty
 *  3. Missing generated timestamp — error if generatedAt is empty
 *  4. Missing purpose           — warning for each artifact without purpose
 *  5. Empty file                — error for each artifact with fileSize === 0
 *  6. Stale file                — warning for each artifact flagged stale
 *  7. Checksum mismatch         — error when expected checksum != actual
 *  8. Missing required file     — error when expected artifact not found in output
 *  9. Unexpected file           — warning when output file not in expected set
 * 10. Wrong file type           — error when artifact type doesn't match expected
 *
 * @module
 */

import { ExportManifestCode, manifestError, manifestWarning } from './errors.js';
import type { ExportManifestIssue } from './types.js';
import type { ExportManifestInput, ExportManifestReport, ExportManifestSummary } from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

/** Simple semver regex: major.minor.patch with optional pre-release. */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/;

// ── Rule: invalid manifest version ──────────────────────────────────────────

function checkManifestVersion(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  if (!input.version || !SEMVER_RE.test(input.version)) {
    issues.push(
      manifestError(
        ExportManifestCode.INVALID_MANIFEST_VERSION,
        `Manifest version "${input.version ?? ''}" is not a valid semver string (expected e.g. "1.0.0")`,
        {
          path: 'version',
          remediationHint: 'Set the manifest version to a valid semver string like "1.0.0"',
          details: { providedVersion: input.version },
        },
      ),
    );
  }

  return issues;
}

// ── Rule: missing source project ────────────────────────────────────────────

function checkSourceProject(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  if (!input.sourceProjectId || input.sourceProjectId.trim().length === 0) {
    issues.push(
      manifestError(
        ExportManifestCode.MISSING_SOURCE_PROJECT,
        'Manifest is missing a source project identifier',
        {
          path: 'sourceProjectId',
          remediationHint:
            'Set sourceProjectId to the EasyEDA project UUID that produced this export',
        },
      ),
    );
  }

  // Check each artifact for source project
  for (const [i, artifact] of input.artifacts.entries()) {
    if (!artifact.sourceProject || artifact.sourceProject.trim().length === 0) {
      issues.push(
        manifestWarning(
          ExportManifestCode.MISSING_SOURCE_PROJECT,
          `Artifact "${artifact.filename}" is missing a source project reference`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            remediationHint:
              'Set sourceProject on each artifact to trace it back to its origin project',
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: missing generated timestamp ────────────────────────────────────────

function checkGeneratedTimestamps(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  // Check manifest-level timestamp
  if (!input.generatedAt || input.generatedAt.trim().length === 0) {
    issues.push(
      manifestError(
        ExportManifestCode.MISSING_GENERATED_TIMESTAMP,
        'Manifest is missing a generation timestamp',
        {
          path: 'generatedAt',
          remediationHint: 'Set generatedAt to the ISO-8601 timestamp of manifest creation',
        },
      ),
    );
  }

  // Check per-artifact timestamps
  for (const [i, artifact] of input.artifacts.entries()) {
    if (!artifact.timestamp || artifact.timestamp.trim().length === 0) {
      issues.push(
        manifestWarning(
          ExportManifestCode.MISSING_GENERATED_TIMESTAMP,
          `Artifact "${artifact.filename}" is missing a generation timestamp`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            remediationHint: 'Add an ISO-8601 timestamp to each artifact for staleness tracking',
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: missing purpose ────────────────────────────────────────────────────

function checkMissingPurposes(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  for (const [i, artifact] of input.artifacts.entries()) {
    if (!artifact.purpose || artifact.purpose.trim().length === 0) {
      issues.push(
        manifestWarning(
          ExportManifestCode.MISSING_PURPOSE,
          `Artifact "${artifact.filename}" is missing a purpose description`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            remediationHint:
              'Add a brief purpose description (e.g. "Top copper layer", "Schematic PDF")',
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: empty files ────────────────────────────────────────────────────────

function checkEmptyFiles(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  for (const [i, artifact] of input.artifacts.entries()) {
    if (artifact.fileSize !== undefined && artifact.fileSize === 0) {
      issues.push(
        manifestError(
          ExportManifestCode.EMPTY_FILE,
          `Artifact "${artifact.filename}" is empty (0 bytes)`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            artifactType: artifact.fileType,
            remediationHint:
              'Re-export the artifact — the file may have been truncated or the export may have failed silently',
            details: { fileSize: artifact.fileSize },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: stale files ────────────────────────────────────────────────────────

function checkStaleFiles(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  for (const [i, artifact] of input.artifacts.entries()) {
    if (artifact.stale) {
      issues.push(
        manifestWarning(
          ExportManifestCode.STALE_FILE,
          `Artifact "${artifact.filename}" is stale and may not reflect the current design`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            artifactType: artifact.fileType,
            remediationHint:
              'Re-export this artifact to ensure it reflects the latest design changes',
            details: { stale: true },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: checksum mismatch ─────────────────────────────────────────────────

function checkChecksumMismatches(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  for (const [i, artifact] of input.artifacts.entries()) {
    if (
      artifact.checksum !== undefined &&
      artifact.checksum !== null &&
      artifact.checksum.trim().length > 0 &&
      artifact.checksum.includes(':') // format: "expected:actual" for comparison
    ) {
      const parts = artifact.checksum.split(':');
      const expected = parts[0];
      const actual = parts[1];
      if (expected && actual && expected !== actual) {
        issues.push(
          manifestError(
            ExportManifestCode.CHECKSUM_MISMATCH,
            `Checksum mismatch for "${artifact.filename}": expected ${expected}, got ${actual}`,
            {
              path: `artifacts[${i}]`,
              artifactPath: artifact.filename,
              remediationHint: 'Re-export the file or verify the source file integrity',
              details: {
                expectedChecksum: expected,
                actualChecksum: actual,
              },
            },
          ),
        );
      }
    }
  }

  return issues;
}

// ── Rule: missing required files ────────────────────────────────────────────

function checkMissingRequiredFiles(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  if (!input.expectedArtifacts || input.expectedArtifacts.length === 0) {
    return issues;
  }

  const exportedNames = new Set(input.artifacts.map((a) => a.filename));

  for (const [i, expected] of input.expectedArtifacts.entries()) {
    const isRequired = expected.required ?? true; // default to required
    if (isRequired && !exportedNames.has(expected.filename)) {
      issues.push(
        manifestError(
          ExportManifestCode.MISSING_REQUIRED_FILE,
          `Required artifact "${expected.filename}" (${expected.fileType}) was not found in the export output`,
          {
            path: `expectedArtifacts[${i}]`,
            artifactType: expected.fileType,
            remediationHint: 'Re-run the export to ensure all required files are generated',
            details: {
              expectedFilename: expected.filename,
              expectedFileType: expected.fileType,
            },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: unexpected files ──────────────────────────────────────────────────

function checkUnexpectedFiles(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  if (!input.expectedArtifacts || input.expectedArtifacts.length === 0) {
    return issues;
  }

  const expectedNames = new Set(input.expectedArtifacts.map((a) => a.filename));

  for (const [i, artifact] of input.artifacts.entries()) {
    if (!expectedNames.has(artifact.filename)) {
      issues.push(
        manifestWarning(
          ExportManifestCode.UNEXPECTED_FILE,
          `Unexpected artifact "${artifact.filename}" was found but is not listed in expected artifacts`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            artifactType: artifact.fileType,
            remediationHint:
              'Either add this file to the expected artifact list or verify it is intentionally included',
            details: { filename: artifact.filename },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Rule: wrong file type ───────────────────────────────────────────────────

function checkWrongFileTypes(input: ExportManifestInput): ExportManifestIssue[] {
  const issues: ExportManifestIssue[] = [];

  if (!input.expectedArtifacts || input.expectedArtifacts.length === 0) {
    return issues;
  }

  // Build a map of expected file types by filename
  const expectedTypeByFile = new Map<string, string>();
  for (const expected of input.expectedArtifacts) {
    expectedTypeByFile.set(expected.filename, expected.fileType);
  }

  for (const [i, artifact] of input.artifacts.entries()) {
    const expectedType = expectedTypeByFile.get(artifact.filename);
    if (expectedType && artifact.fileType !== expectedType) {
      issues.push(
        manifestError(
          ExportManifestCode.WRONG_FILE_TYPE,
          `Artifact "${artifact.filename}" has type "${artifact.fileType}" but expected "${expectedType}"`,
          {
            path: `artifacts[${i}]`,
            artifactPath: artifact.filename,
            artifactType: artifact.fileType,
            remediationHint:
              'Check the export configuration — the file may have been assigned the wrong format',
            details: {
              actualType: artifact.fileType,
              expectedType,
            },
          },
        ),
      );
    }
  }

  return issues;
}

// ── Combine helper ──────────────────────────────────────────────────────────

type RuleFn = (input: ExportManifestInput) => ExportManifestIssue[];

const RULES: RuleFn[] = [
  checkManifestVersion,
  checkSourceProject,
  checkGeneratedTimestamps,
  checkMissingPurposes,
  checkEmptyFiles,
  checkStaleFiles,
  checkChecksumMismatches,
  checkMissingRequiredFiles,
  checkUnexpectedFiles,
  checkWrongFileTypes,
];

// ── Summary builder ─────────────────────────────────────────────────────────

function buildSummary(
  issues: ExportManifestIssue[],
  input: ExportManifestInput,
): ExportManifestSummary {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;

  return {
    totalFiles: input.artifacts.length,
    errors,
    warnings,
    missingRequired: issues.filter((i) => i.code === ExportManifestCode.MISSING_REQUIRED_FILE)
      .length,
    emptyFiles: issues.filter((i) => i.code === ExportManifestCode.EMPTY_FILE).length,
    staleFiles: issues.filter((i) => i.code === ExportManifestCode.STALE_FILE).length,
    checksumMismatches: issues.filter((i) => i.code === ExportManifestCode.CHECKSUM_MISMATCH)
      .length,
    unexpectedFiles: issues.filter((i) => i.code === ExportManifestCode.UNEXPECTED_FILE).length,
    wrongFileTypes: issues.filter((i) => i.code === ExportManifestCode.WRONG_FILE_TYPE).length,
    missingPurposes: issues.filter((i) => i.code === ExportManifestCode.MISSING_PURPOSE).length,
    missingTimestamps: issues.filter(
      (i) => i.code === ExportManifestCode.MISSING_GENERATED_TIMESTAMP,
    ).length,
    missingSourceProjects: issues.filter(
      (i) => i.code === ExportManifestCode.MISSING_SOURCE_PROJECT,
    ).length,
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Run all export manifest validation rules against an input manifest.
 *
 * Orchestrates 10 rules:
 *  1. Invalid manifest version   — error if version is not valid semver
 *  2. Missing source project     — error if sourceProjectId is empty
 *                                — warning per artifact without sourceProject
 *  3. Missing generated timestamp— error if generatedAt is empty
 *                                — warning per artifact without timestamp
 *  4. Missing purpose            — warning per artifact without purpose
 *  5. Empty file                 — error per artifact with fileSize === 0
 *  6. Stale file                 — warning per artifact with stale === true
 *  7. Checksum mismatch          — error when checksum "expected:actual" differs
 *  8. Missing required file      — error when expected artifact not in output
 *  9. Unexpected file            — warning when output file not in expected set
 * 10. Wrong file type            — error when artifact type !== expected type
 */
export function validateExportManifest(input: ExportManifestInput): ExportManifestReport {
  const issues: ExportManifestIssue[] = [];

  for (const rule of RULES) {
    const ruleIssues = rule(input);
    issues.push(...ruleIssues);
  }

  const errors = issues.filter((i) => i.severity === 'error').length;

  return {
    valid: errors === 0,
    manifest: input,
    issues,
    summary: buildSummary(issues, input),
  };
}
