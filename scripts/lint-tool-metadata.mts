import { EnvSchema } from '../src/config/env.js';
import { registerBuiltinTools } from '../src/tools/register.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { type ToolDefinition } from '../src/tools/types.js';

interface Finding {
  tool: string;
  field: 'title' | 'description';
  code: string;
  message: string;
}

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, 'prompt_override'],
  [/disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i, 'prompt_override'],
  [/system\s+prompt/i, 'system_prompt_reference'],
  [/developer\s+message/i, 'developer_message_reference'],
  [/hidden\s+(chain|reasoning|thoughts?)/i, 'hidden_reasoning_reference'],
  [/(api[_ -]?key|token|password|secret|private\s+key)/i, 'secret_reference'],
  [/https?:\/\//i, 'external_url'],
];

const SAFETY_WORDS = [
  'confirm',
  'safe',
  'controlled',
  'requires',
  'write',
  'export',
  'mutate',
  'place',
  'add',
  'draw',
  'delete',
  'modify',
  'create',
  'connect',
  'save',
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function lintText(tool: ToolDefinition, field: 'title' | 'description', value: string): Finding[] {
  const findings: Finding[] = [];
  const normalized = normalizeText(value);

  if (!normalized) {
    findings.push({
      tool: tool.name,
      field,
      code: 'empty',
      message: `${field} must not be empty.`,
    });
    return findings;
  }

  if (field === 'title' && normalized.length > 80) {
    findings.push({
      tool: tool.name,
      field,
      code: 'title_too_long',
      message: 'Tool title should stay under 80 characters for compact client UI.',
    });
  }

  if (field === 'description') {
    if (normalized.length < 24) {
      findings.push({
        tool: tool.name,
        field,
        code: 'description_too_short',
        message: 'Description is too short to explain safe tool behavior.',
      });
    }
    if (normalized.length > 320) {
      findings.push({
        tool: tool.name,
        field,
        code: 'description_too_long',
        message: 'Description should stay under 320 characters to reduce prompt surface area.',
      });
    }
    if (/[{}<>]/.test(normalized)) {
      findings.push({
        tool: tool.name,
        field,
        code: 'template_tokens',
        message: 'Description should not contain template-like braces or angle brackets.',
      });
    }
  }

  if (normalized !== value.trim()) {
    findings.push({
      tool: tool.name,
      field,
      code: 'whitespace',
      message: `${field} contains repeated whitespace or newlines.`,
    });
  }

  for (const [pattern, code] of DANGEROUS_PATTERNS) {
    if (!pattern.test(normalized)) continue;
    if (code === 'secret_reference' && /redacted|never exposed|never expose/i.test(normalized)) {
      continue;
    }
    findings.push({
      tool: tool.name,
      field,
      code,
      message: `${field} contains wording that can increase prompt-injection or data-exfiltration risk.`,
    });
  }

  return findings;
}

function lintTool(tool: ToolDefinition): Finding[] {
  const findings = [
    ...lintText(tool, 'title', tool.title),
    ...lintText(tool, 'description', tool.description),
  ];

  if (tool.confirmWrite) {
    const description = tool.description.toLowerCase();
    const mentionsSafety = SAFETY_WORDS.some((word) => description.includes(word));
    if (!mentionsSafety) {
      findings.push({
        tool: tool.name,
        field: 'description',
        code: 'missing_write_safety_context',
        message:
          'Mutating tools should mention safe/controlled/write/export behavior in their description.',
      });
    }
  }

  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    findings.push({
      tool: tool.name,
      field: 'title',
      code: 'invalid_tool_name',
      message: 'Tool name should be lowercase snake_case for predictable MCP clients.',
    });
  }

  return findings;
}

const registry = new ToolRegistry();
registerBuiltinTools(registry, EnvSchema.parse({ NODE_ENV: 'test' }));

const findings = registry.getAllTools().flatMap(lintTool);

if (findings.length > 0) {
  console.error('Tool metadata lint failed:');
  for (const finding of findings) {
    console.error(`- ${finding.tool} [${finding.field}/${finding.code}]: ${finding.message}`);
  }
  process.exit(1);
}

console.log(`OK: ${registry.getAllTools().length} tool metadata entries passed lint.`);
