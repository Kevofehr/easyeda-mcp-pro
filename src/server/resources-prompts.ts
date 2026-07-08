import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { type ToolContext } from '../tools/types.js';

// The living style guide is served straight from the repo markdown file so a user
// (or the agent) can edit it and have the change take effect with no rebuild.
// dist/server/resources-prompts.js and src/server/resources-prompts.ts both sit
// two levels under the package root, so ../../docs resolves the same either way.
const STYLE_GUIDE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/reference/schematic-pcb-style-guide.md',
);

async function readStyleGuide(uri: URL) {
  try {
    const text = await readFile(STYLE_GUIDE_PATH, 'utf8');
    return textResource(uri, text);
  } catch (error) {
    return textResource(
      uri,
      [
        '# Schematic & PCB Style Guide',
        '',
        `Could not read the style guide at ${STYLE_GUIDE_PATH}.`,
        `Reason: ${error instanceof Error ? error.message : String(error)}`,
        '',
        'Create docs/reference/schematic-pcb-style-guide.md (or run the server from',
        'the repo root so the docs directory is reachable).',
      ].join('\n'),
    );
  }
}

interface BridgeNet {
  netName?: string;
  nodes?: Array<{ component?: string; pin?: string }>;
}

interface BomEntry {
  reference?: string;
  value?: string;
  footprint?: string;
  lcsc?: string;
  quantity?: number;
  manufacturer?: string;
}

function projectIdFromVariables(variables: Record<string, unknown>): string {
  const value = variables.projectId;
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value ?? '');
}

function jsonResource(uri: URL, payload: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function textResource(uri: URL, text: string) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text,
      },
    ],
  };
}

async function readProjectNetlist(uri: URL, projectId: string, context: ToolContext) {
  try {
    const result = (await context.bridge.call('schematic.listNets', { projectId })) as BridgeNet[];
    const nets = (result ?? []).map((net) => ({
      net_name: net.netName ?? '',
      node_count: net.nodes?.length ?? 0,
      nodes: (net.nodes ?? []).map((node) => ({
        component_ref: node.component ?? '',
        pin: node.pin ?? '',
      })),
    }));
    return jsonResource(uri, { project_id: projectId, total: nets.length, nets });
  } catch (error) {
    return jsonResource(uri, {
      project_id: projectId,
      total: 0,
      nets: [],
      not_available: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readProjectBom(uri: URL, projectId: string, context: ToolContext) {
  try {
    const result = (await context.bridge.call('bom.generate', {
      projectId,
      format: 'json',
      groupBy: 'value',
    })) as BomEntry[];
    const entries = (result ?? []).map((entry) => ({
      reference: entry.reference ?? '',
      value: entry.value ?? '',
      footprint: entry.footprint ?? '',
      lcsc: entry.lcsc,
      quantity: entry.quantity ?? 0,
      manufacturer: entry.manufacturer,
    }));
    return jsonResource(uri, { project_id: projectId, total_entries: entries.length, entries });
  } catch (error) {
    return jsonResource(uri, {
      project_id: projectId,
      total_entries: 0,
      entries: [],
      not_available: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function reviewWorkflowText(): string {
  return [
    '# EasyEDA Project Review Workflow',
    '',
    'Use this workflow before applying schematic, PCB, BOM, or export changes.',
    '',
    '0. Read the house style guide resource (easyeda://guide/style) and follow it when authoring or reviewing schematics/PCBs. After any correction, record the new rule back into that guide.',
    '1. Read the project netlist resource and identify floating nets, duplicate labels, and suspicious one-node nets.',
    '2. Read the BOM resource and check missing LCSC numbers, missing footprints, quantity anomalies, and lifecycle risks.',
    '3. Run read-only ERC/DRC and board inspection tools before any write tool.',
    '4. For every mutation tool, use writeMode=plan or writeMode=preview first, then apply only with confirmWrite=true after user approval.',
    '5. After apply, use writeMode=verify plus read-only diagnostics to confirm the design state.',
  ].join('\n');
}

function promptText(title: string, projectId: string, body: string): string {
  return [
    title,
    '',
    `Project ID: ${projectId}`,
    '',
    'Reference resources:',
    `- easyeda://project/${projectId}/netlist`,
    `- easyeda://project/${projectId}/bom`,
    '- easyeda://workflow/project-review',
    '- easyeda://guide/style',
    '',
    body,
  ].join('\n');
}

const promptArgsSchema = {
  projectId: z.string().min(1).describe('EasyEDA project identifier to review.'),
};

export function registerProjectResourcesAndPrompts(server: McpServer, context: ToolContext): void {
  server.registerResource(
    'project_netlist',
    new ResourceTemplate('easyeda://project/{projectId}/netlist', { list: undefined }),
    {
      title: 'Project netlist',
      description: 'Read-only JSON snapshot of schematic nets for a project.',
      mimeType: 'application/json',
    },
    async (uri, variables) => readProjectNetlist(uri, projectIdFromVariables(variables), context),
  );

  server.registerResource(
    'project_bom',
    new ResourceTemplate('easyeda://project/{projectId}/bom', { list: undefined }),
    {
      title: 'Project BOM',
      description: 'Read-only JSON snapshot of project BOM entries.',
      mimeType: 'application/json',
    },
    async (uri, variables) => readProjectBom(uri, projectIdFromVariables(variables), context),
  );

  server.registerResource(
    'project_review_workflow',
    'easyeda://workflow/project-review',
    {
      title: 'Project review workflow',
      description: 'Agent-safe workflow for reviewing schematic, BOM, PCB, and export changes.',
      mimeType: 'text/markdown',
    },
    async (uri) => textResource(uri, reviewWorkflowText()),
  );

  server.registerResource(
    'style_guide',
    'easyeda://guide/style',
    {
      title: 'Schematic & PCB style guide',
      description:
        'House style for clean schematics and PCBs. Living document - read before authoring, and append any correction so it is not repeated. Served live from docs/reference/schematic-pcb-style-guide.md.',
      mimeType: 'text/markdown',
    },
    async (uri) => readStyleGuide(uri),
  );

  server.registerPrompt(
    'review_schematic',
    {
      title: 'Review schematic',
      description: 'Review project schematic connectivity before making changes.',
      argsSchema: promptArgsSchema,
    },
    ({ projectId }) => ({
      description: 'Schematic review prompt for EasyEDA projects.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText(
              'Review the EasyEDA schematic connectivity.',
              projectId,
              'Check net names, one-node nets, missing power connections, ambiguous labels, and risks that should block write operations.',
            ),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'review_bom',
    {
      title: 'Review BOM',
      description: 'Review project BOM completeness and sourcing readiness.',
      argsSchema: promptArgsSchema,
    },
    ({ projectId }) => ({
      description: 'BOM review prompt for EasyEDA projects.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText(
              'Review the EasyEDA project BOM.',
              projectId,
              'Check missing LCSC numbers, quantities, footprints, manufacturer data, lifecycle risk, and alternates before export or ordering.',
            ),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'prepare_manufacturing_review',
    {
      title: 'Prepare manufacturing review',
      description: 'Prepare a safe pre-manufacturing review plan for PCB export.',
      argsSchema: promptArgsSchema,
    },
    ({ projectId }) => ({
      description: 'Manufacturing readiness review prompt for EasyEDA projects.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText(
              'Prepare the EasyEDA project for manufacturing review.',
              projectId,
              'Inspect ERC/DRC status, board outline, layers, vias, Gerber export readiness, BOM readiness, pick-and-place readiness, and human approval gates.',
            ),
          },
        },
      ],
    }),
  );
}
