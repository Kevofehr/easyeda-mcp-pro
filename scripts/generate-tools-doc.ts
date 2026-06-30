import { ToolRegistry } from '../src/tools/registry.js';
import { registerBuiltinTools } from '../src/tools/register.js';
import { EnvSchema } from '../src/config/env.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { format } from 'prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getFriendlyZodType(schema: z.ZodTypeAny): string {
  const typeName = schema._def?.typeName;
  if (typeName === 'ZodObject') return 'object';
  if (typeName === 'ZodArray') return `${getFriendlyZodType((schema as any).element)}[]`;
  if (typeName === 'ZodString') return 'string';
  if (typeName === 'ZodNumber') return 'number';
  if (typeName === 'ZodBoolean') return 'boolean';
  if (typeName === 'ZodEnum')
    return (schema as any).options.map((v: string) => `"${v}"`).join(' | ');
  if (typeName === 'ZodOptional')
    return `${getFriendlyZodType((schema as any).unwrap())} (optional)`;
  if (typeName === 'ZodNullable') return `${getFriendlyZodType((schema as any).unwrap())} | null`;
  if (typeName === 'ZodUnion')
    return (schema as any).options.map((opt: any) => getFriendlyZodType(opt)).join(' | ');
  if (typeName === 'ZodLiteral') return `"${schema._def.value}"`;
  if (typeName === 'ZodEffects') return getFriendlyZodType((schema as any).innerType());
  return 'any';
}

function generateMarkdown(): string {
  const registry = new ToolRegistry();
  const config = EnvSchema.parse({
    NODE_ENV: 'production',
    LOG_LEVEL: 'silent',
    TOOL_PROFILE: 'dev', // register all dev tools for docs
  });

  registerBuiltinTools(registry, config);

  const tools = registry.getAllTools().sort((a, b) => a.name.localeCompare(b.name));

  const md: string[] = [
    '# MCP Tools Reference',
    '',
    'This page details all available Model Context Protocol (MCP) tools exposed by `easyeda-mcp-pro`.',
    'These tools are profile-gated. Set the `TOOL_PROFILE` environment variable to enable them.',
    '',
    '## Summary of Tools',
    '',
    '| Tool Name | Profile | Risk | Description |',
    '|-----------|---------|------|-------------|',
  ];

  for (const tool of tools) {
    md.push(`| \`${tool.name}\` | \`${tool.profile}\` | \`${tool.risk}\` | ${tool.description} |`);
  }

  md.push('', '---', '');

  for (const tool of tools) {
    md.push(`## \`${tool.name}\``, '');
    md.push(`**Profile:** \`${tool.profile}\` | **Risk Level:** \`${tool.risk}\``, '');
    md.push(`> ${tool.description}`, '');
    md.push('');

    // Input parameters
    md.push('### Input Parameters', '');
    if (tool.inputSchema instanceof z.ZodObject) {
      const shape = tool.inputSchema.shape;
      const keys = Object.keys(shape);
      if (keys.length === 0) {
        md.push('No parameters required.', '');
      } else {
        md.push('| Parameter | Type | Required | Description |');
        md.push('|-----------|------|----------|-------------|');
        for (const [key, prop] of Object.entries(shape)) {
          const schema = prop as z.ZodTypeAny;
          const isOptional =
            schema instanceof z.ZodOptional || schema._def.typeName === 'ZodOptional';
          const typeName = getFriendlyZodType(schema);
          const desc = schema.description ?? '';
          md.push(`| \`${key}\` | \`${typeName}\` | ${isOptional ? 'No' : 'Yes'} | ${desc} |`);
        }
        md.push('');
      }
    } else {
      md.push('No parameters required.', '');
    }

    md.push('### Output Format', '');
    md.push('Returns a JSON object matching the schema:', '');
    md.push('```ts');
    if (tool.outputSchema instanceof z.ZodObject) {
      const shape = tool.outputSchema.shape;
      const props = Object.entries(shape).map(([key, prop]) => {
        const schema = prop as z.ZodTypeAny;
        const typeName = getFriendlyZodType(schema);
        return `  ${key}: ${typeName};`;
      });
      md.push('{\n' + props.join('\n') + '\n}');
    } else {
      md.push(getFriendlyZodType(tool.outputSchema));
    }
    md.push('```', '');
    md.push('---', '');
  }

  return md.join('\n');
}

async function main() {
  const destDir = join(__dirname, '..', 'docs', 'reference');
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const content = await format(generateMarkdown(), { parser: 'markdown' });
  writeFileSync(join(destDir, 'tools.md'), content, 'utf8');
  console.log('Successfully generated docs/reference/tools.md');
}

void main();
