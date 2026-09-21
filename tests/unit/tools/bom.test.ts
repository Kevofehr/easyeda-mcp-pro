import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';
import { registerBomCoreTools } from '../../../src/tools/L1_bom_core.js';
import { registerBomSourcingTools } from '../../../src/tools/L1_bom_sourcing.js';
import { EnvSchema } from '../../../src/config/env.js';

describe('BOM Tools Sourcing & Validate', () => {
  let registry: ToolRegistry;
  let context: ToolContext;
  let bridgeCall: any;
  let getPartDetailMock: any;

  beforeEach(() => {
    registry = new ToolRegistry();
    const config = EnvSchema.parse({ NODE_ENV: 'test', JLCSEARCH_ENABLED: 'true' });
    registerBomCoreTools(registry, config);
    registerBomSourcingTools(registry, config);

    bridgeCall = vi.fn();
    getPartDetailMock = vi.fn();

    context = {
      profile: 'core',
      bridge: {
        connected: true,
        call: bridgeCall,
      },
      config: {
        bridgeTimeoutMs: 1000,
        artifactDir: '.easyeda-mcp-pro/artifacts',
      },
      vendors: {
        lcsc: {
          getPartDetail: getPartDetailMock,
        } as any,
        jlcpcb: null,
        mouser: null,
        digikey: null,
      },
    };
  });

  it('easyeda_bom_sourcing should query LCSC client and return correct sourcing data', async () => {
    const tool = registry.get('easyeda_bom_sourcing');
    expect(tool).toBeDefined();

    bridgeCall.mockResolvedValue([
      { reference: 'R1', value: '10k', lcsc: 'C12345', quantity: 1 },
      { reference: 'C1', value: '100nF', lcsc: 'C67890', quantity: 2 },
    ]);

    getPartDetailMock.mockImplementation(async (lcscCode: string) => {
      if (lcscCode === 'C12345') {
        return {
          lcsc: 'C12345',
          stockCount: 1500,
          price: '0.015',
          leadTime: 2,
        };
      }
      return null;
    });

    const result = await tool?.handler(context, {
      projectId: 'proj-123',
      suppliers: ['lcsc'],
    });

    expect(bridgeCall).toHaveBeenCalledWith('bom.generate', {
      projectId: 'proj-123',
      format: 'json',
      groupBy: 'lcsc',
    });

    expect(result).toBeDefined();
    expect(result.project_id).toBe('proj-123');
    expect(result.total_parts).toBe(2);
    expect(result.parts[0]).toMatchObject({
      reference: 'R1',
      value: '10k',
      lcsc: 'C12345',
      sourcing: [
        {
          supplier: 'lcsc',
          tier: 'keyless',
          in_stock: true,
          quantity_available: 1500,
          unit_price: 0.015,
          currency: 'USD',
          lead_time_days: 2,
        },
      ],
    });
    expect(result.parts[1]?.sourcing).toHaveLength(0);
    expect(result.keyless_sourcing_enabled).toBe(true);
  });

  it('easyeda_bom_sourcing surfaces classification metadata from the keyless tier', async () => {
    const tool = registry.get('easyeda_bom_sourcing');

    bridgeCall.mockResolvedValue([{ reference: 'R1', value: '10k', lcsc: 'C12345', quantity: 1 }]);
    getPartDetailMock.mockResolvedValue({
      lcsc: 'C12345',
      stockCount: 1500,
      price: '0.015',
      classification: 'basic',
    });

    const result = await tool?.handler(context, { projectId: 'proj-123' });

    expect(result.parts[0]?.sourcing[0]).toMatchObject({ classification: 'basic' });
  });

  it('easyeda_bom_sourcing skips the keyless tier when KEYLESS_SOURCING_ENABLED is false', async () => {
    const tool = registry.get('easyeda_bom_sourcing');

    bridgeCall.mockResolvedValue([{ reference: 'R1', value: '10k', lcsc: 'C12345', quantity: 1 }]);
    getPartDetailMock.mockResolvedValue({ lcsc: 'C12345', stockCount: 1500 });
    context.config.keylessSourcingEnabled = false;

    const result = await tool?.handler(context, { projectId: 'proj-123' });

    expect(getPartDetailMock).not.toHaveBeenCalled();
    expect(result.parts[0]?.sourcing).toEqual([]);
    expect(result.keyless_sourcing_enabled).toBe(false);
  });

  it('easyeda_bom_validate should categorize missing, invalid, and obsolete parts', async () => {
    const tool = registry.get('easyeda_bom_validate');
    expect(tool).toBeDefined();

    bridgeCall.mockResolvedValue([
      { reference: 'R1', value: '10k' }, // Missing LCSC
      { reference: 'C1', value: '100nF', lcsc: 'C99999' }, // Invalid
      { reference: 'U1', value: 'MCU', lcsc: 'C55555' }, // Obsolete
      { reference: 'Q1', value: 'MOSFET', lcsc: 'C11111' }, // Valid
    ]);

    getPartDetailMock.mockImplementation(async (lcscCode: string) => {
      if (lcscCode === 'C55555') {
        return { lcsc: 'C55555', discontinued: true };
      }
      if (lcscCode === 'C11111') {
        return { lcsc: 'C11111', discontinued: false, stock: 100 };
      }
      return null; // C99999 is invalid
    });

    const result = await tool?.handler(context, {
      projectId: 'proj-123',
    });

    expect(result).toBeDefined();
    expect(result.project_id).toBe('proj-123');
    expect(result.total_parts).toBe(4);
    expect(result.missing_lcsc).toContain('R1');
    expect(result.invalid_lcsc).toContain('C1');
    expect(result.obsolete).toContain('U1');
    expect(result.valid_count).toBe(1);
    expect(result.validated).toBe(true);
  });

  it('easyeda_bom_validate should return not_available when the bridge call fails', async () => {
    const tool = registry.get('easyeda_bom_validate');
    bridgeCall.mockRejectedValue(new Error('bridge offline'));

    const result = await tool?.handler(context, { projectId: 'proj-123' });

    expect(result.validated).toBe(false);
    expect(result.not_available).toBe(true);
    expect(result.error).toBe('bridge offline');
  });

  describe('easyeda_bom_generate', () => {
    it('returns formatted entries on success', async () => {
      const tool = registry.get('easyeda_bom_generate');
      bridgeCall.mockResolvedValue([
        { reference: 'R1', value: '10k', footprint: '0603', lcsc: 'C1', quantity: 2 },
      ]);

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'json',
        groupBy: 'value',
      });

      expect(bridgeCall).toHaveBeenCalledWith('bom.generate', {
        projectId: 'proj-1',
        format: 'json',
        groupBy: 'value',
      });
      expect(result.total_entries).toBe(1);
      expect(result.entries[0]).toMatchObject({ reference: 'R1', value: '10k', quantity: 2 });
    });

    it('returns not_available when the bridge call fails', async () => {
      const tool = registry.get('easyeda_bom_generate');
      bridgeCall.mockRejectedValue(new Error('no active project'));

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'json',
        groupBy: 'value',
      });

      expect(result.not_available).toBe(true);
      expect(result.total_entries).toBe(0);
      expect(result.error).toBe('no active project');
    });
  });

  describe('easyeda_bom_export', () => {
    let tmpArtifactDir: string;

    beforeEach(() => {
      tmpArtifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bom-export-'));
      context.config.artifactDir = tmpArtifactDir;
    });

    afterEach(() => {
      fs.rmSync(tmpArtifactDir, { recursive: true, force: true });
    });

    const sampleRows = [
      {
        reference: 'R1, R2',
        value: '10k',
        footprint: '0603',
        lcsc: 'C25804',
        quantity: 2,
        manufacturer: 'Uniroyal',
      },
      {
        reference: 'C1',
        value: '100nF',
        footprint: '0402',
        lcsc: 'C1525',
        quantity: 1,
        manufacturer: 'Samsung',
      },
    ];

    it('writes a real CSV file with a header row and the BOM entries', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue(sampleRows);
      const filePath = path.join(tmpArtifactDir, 'bom.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath,
      });

      expect(result.exported).toBe(true);
      expect(result.entry_count).toBe(2);

      // The returned path must exist and be non-empty.
      expect(fs.existsSync(result.file_path)).toBe(true);
      const stat = fs.statSync(result.file_path);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
      expect(result.byte_length).toBe(stat.size);

      const content = fs.readFileSync(result.file_path, 'utf-8');
      const lines = content.trimEnd().split('\r\n');
      expect(lines[0]).toBe('reference,value,footprint,lcsc,quantity,manufacturer');
      // The comma-joined designator list must be quoted, not split into columns.
      expect(lines[1]).toBe('"R1, R2",10k,0603,C25804,2,Uniroyal');
      expect(lines[2]).toBe('C1,100nF,0402,C1525,1,Samsung');
      // LCSC part numbers and designators survive the round trip.
      expect(content).toContain('C25804');
      expect(content).toContain('R1, R2');
    });

    it('asks the bridge for BOM rows rather than a server-side export path', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue(sampleRows);

      await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath: path.join(tmpArtifactDir, 'bom.csv'),
      });

      expect(bridgeCall).toHaveBeenCalledWith('bom.generate', {
        projectId: 'proj-1',
        format: 'json',
        groupBy: 'value',
      });
    });

    it('writes a JSON file when format is json', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue(sampleRows);
      const filePath = path.join(tmpArtifactDir, 'bom.json');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'json',
        filePath,
      });

      expect(result.exported).toBe(true);
      expect(fs.existsSync(result.file_path)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(result.file_path, 'utf-8'));
      expect(parsed).toHaveLength(2);
      expect(parsed[0].lcsc).toBe('C25804');
    });

    it('escapes commas, quotes and newlines in CSV fields', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue([
        {
          reference: 'U1',
          value: 'A "quoted" part',
          footprint: 'SOT-23, wide',
          lcsc: 'C1',
          quantity: 1,
          manufacturer: 'Line1\nLine2',
        },
      ]);
      const filePath = path.join(tmpArtifactDir, 'escaped.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath,
      });

      expect(result.exported).toBe(true);
      const content = fs.readFileSync(result.file_path, 'utf-8');
      expect(content).toContain('"A ""quoted"" part"');
      expect(content).toContain('"SOT-23, wide"');
      expect(content).toContain('"Line1\nLine2"');
    });

    it('writes a header-only file for an empty BOM and reports zero entries', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue([]);
      const filePath = path.join(tmpArtifactDir, 'empty.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath,
      });

      expect(result.exported).toBe(true);
      expect(result.entry_count).toBe(0);
      expect(fs.existsSync(result.file_path)).toBe(true);
      expect(fs.statSync(result.file_path).size).toBeGreaterThan(0);
      expect(fs.readFileSync(result.file_path, 'utf-8').trimEnd()).toBe(
        'reference,value,footprint,lcsc,quantity,manufacturer',
      );
    });

    it('creates missing parent directories before exporting', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue(sampleRows);
      const filePath = path.join(tmpArtifactDir, 'nested', 'dir', 'bom.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath,
      });

      expect(result.exported).toBe(true);
      expect(fs.existsSync(path.dirname(filePath))).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('regression: does not claim success when the bridge returns no BOM rows', async () => {
      // The pre-fix bridge contract was assumed to be `{entryCount: n}` plus a
      // server-side file write that never happened, so the tool answered
      // `exported: true` with nothing on disk. Any non-array reply must now fail.
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue({ entryCount: 3 });
      const filePath = path.join(tmpArtifactDir, 'phantom.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath,
      });

      expect(result.exported).toBe(false);
      expect(result.not_available).toBe(true);
      expect(result.error).toMatch(/did not return BOM rows/i);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('reports an honest failure for xlsx instead of a phantom success', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockResolvedValue(sampleRows);
      const filePath = path.join(tmpArtifactDir, 'bom.xlsx');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'xlsx',
        filePath,
      });

      expect(result.exported).toBe(false);
      expect(result.not_available).toBe(true);
      expect(result.error).toMatch(/csv/i);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('rejects a file path that escapes the artifact directory', async () => {
      const tool = registry.get('easyeda_bom_export');
      const outsidePath = path.join(os.tmpdir(), 'outside-bom.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath: outsidePath,
      });

      expect(result.exported).toBe(false);
      expect(result.not_available).toBe(true);
      expect(result.error).toMatch(/inside the artifact directory/i);
      expect(bridgeCall).not.toHaveBeenCalled();
      expect(fs.existsSync(outsidePath)).toBe(false);
    });

    it('rejects a traversal path that escapes the artifact directory', async () => {
      const tool = registry.get('easyeda_bom_export');
      const traversalPath = path.join(tmpArtifactDir, '..', 'escaped-bom.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath: traversalPath,
      });

      expect(result.exported).toBe(false);
      expect(result.not_available).toBe(true);
      expect(bridgeCall).not.toHaveBeenCalled();
      expect(fs.existsSync(path.resolve(traversalPath))).toBe(false);
    });

    it('returns not_available when the bridge export call fails', async () => {
      const tool = registry.get('easyeda_bom_export');
      bridgeCall.mockRejectedValue(new Error('export failed'));
      const filePath = path.join(tmpArtifactDir, 'bom.csv');

      const result = await tool?.handler(context, {
        projectId: 'proj-1',
        format: 'csv',
        filePath,
      });

      expect(result.exported).toBe(false);
      expect(result.not_available).toBe(true);
      expect(result.error).toBe('export failed');
    });
  });

  describe('easyeda_bom_sourcing edge cases', () => {
    it('returns an empty parts list when the BOM has no entries', async () => {
      const tool = registry.get('easyeda_bom_sourcing');
      bridgeCall.mockResolvedValue([]);

      const result = await tool?.handler(context, { projectId: 'proj-1' });

      expect(result).toEqual({ project_id: 'proj-1', parts: [], total_parts: 0 });
    });

    it('returns not_available when the bridge call fails', async () => {
      const tool = registry.get('easyeda_bom_sourcing');
      bridgeCall.mockRejectedValue(new Error('bridge offline'));

      const result = await tool?.handler(context, { projectId: 'proj-1' });

      expect(result.not_available).toBe(true);
      expect(result.parts).toEqual([]);
    });
  });

  describe('easyeda_bom_quality_report', () => {
    it('returns an empty report when the BOM has no entries', async () => {
      const tool = registry.get('easyeda_bom_quality_report');
      bridgeCall.mockResolvedValue([]);

      const result = await tool?.handler(context, { projectId: 'proj-1' });

      expect(result.total_entries).toBe(0);
      expect(result.entries).toEqual([]);
      expect(result.has_supplier_errors).toBe(false);
    });

    it('generates a quality report for BOM entries with no vendor clients configured', async () => {
      const tool = registry.get('easyeda_bom_quality_report');
      bridgeCall.mockResolvedValue([
        { reference: 'R1', value: '10k', footprint: '0603', quantity: 1 },
      ]);
      context.vendors = { lcsc: null, jlcpcb: null, mouser: null, digikey: null };

      const result = await tool?.handler(context, { projectId: 'proj-1' });

      expect(result.bom_id).toBe('proj-1');
      expect(result.total_entries).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].reference).toBe('R1');
    });

    it('returns not_available when the bridge call fails', async () => {
      const tool = registry.get('easyeda_bom_quality_report');
      bridgeCall.mockRejectedValue(new Error('bridge offline'));

      const result = await tool?.handler(context, { projectId: 'proj-1' });

      expect(result.not_available).toBe(true);
      expect(result.entries).toEqual([]);
      expect(result.error).toBe('bridge offline');
    });
  });
});
