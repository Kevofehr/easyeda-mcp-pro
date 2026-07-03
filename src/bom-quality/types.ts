/**
 * BOM quality — core type definitions.
 *
 * @module
 */

/** Supported supplier identifiers. */
export type SupplierKind = 'lcsc' | 'mouser' | 'digikey' | 'jlcpcb';

/** Lifecycle / status of a part at a supplier. */
export type PartLifecycle = 'active' | 'discontinued' | 'unknown';

/** BOM entry as passed to quality check, extended with metadata. */
export interface BomEntry {
  reference: string;
  value?: string;
  footprint?: string;
  lcsc?: string;
  mpn?: string;
  manufacturer?: string;
  quantity: number;
  /** Source of this entry (e.g. 'bridge', 'manual'). */
  source: string;
  /** ISO-8601 timestamp when this entry was obtained. */
  fetchedAt: string;
}

/** Normalised result from a single supplier query. */
export interface SupplierQueryResult {
  supplier: SupplierKind;
  found: boolean;
  lcsc?: string;
  mpn?: string;
  manufacturer?: string;
  description?: string;
  lifecycle: PartLifecycle;
  stock: number;
  unitPrice?: number;
  currency?: string;
  leadTimeDays?: number;
  /** ISO-8601 timestamp of this supplier response. */
  queriedAt: string;
  /** Human-readable confidence (e.g. 'high', 'medium', 'low'). */
  confidence: 'high' | 'medium' | 'low';
}

/** Issue type identifiers for the BOM quality report. */
export type BomQualityIssueType =
  'unavailable' | 'single_source' | 'missing_mpn' | 'missing_footprint' | 'low_stock';

/** A single quality issue found for a BOM entry. */
export interface BomQualityIssue {
  type: BomQualityIssueType;
  severity: 'error' | 'warning' | 'info';
  reference: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Complete BOM quality report. */
export interface BomQualityReport {
  bomId: string;
  generatedAt: string;
  totalEntries: number;
  entries: Array<{
    reference: string;
    description: string;
    footprint: string;
    quantity: number;
    lcsc?: string;
    mpn?: string;
    manufacturer?: string;
    /** Supplier-specific data collected during the check. */
    supplierData: SupplierQueryResult[];
    issues: BomQualityIssue[];
  }>;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
    unavailableCount: number;
    singleSourceCount: number;
    missingMpnCount: number;
    missingFootprintCount: number;
    lowStockCount: number;
  };
  /** Whether any suppliers returned errors during the check. */
  hasSupplierErrors: boolean;
}

/** Configuration for BOM quality checking. */
export interface BomQualityConfig {
  /** Stock threshold below which a part is considered low-stock. */
  lowStockThreshold: number;
  /** Whether to treat a missing LCSC code as an error. */
  requireLcsc: boolean;
  /** Whether to treat a missing MPN as a warning. */
  requireMpn: boolean;
  /** Whether to treat a missing footprint as a warning. */
  requireFootprint: boolean;
}

export const DEFAULT_BOM_QUALITY_CONFIG: BomQualityConfig = {
  lowStockThreshold: 100,
  requireLcsc: false,
  requireMpn: true,
  requireFootprint: true,
};
