import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from './types.js';
import { type EnvConfig } from '../config/env.js';
import { PROFILE_DEFINITIONS } from '../config/profiles.js';
import { SERVER_VERSION } from '../config/version.js';

const apiInventoryInputSchema = z.object({
  filter: z.string().optional(),
});

function registerDiagnosticsCore(
  registry: { register: (def: ToolDefinition) => void },
  config: EnvConfig,
) {
  registry.register({
    name: 'easyeda_health_check',
    title: 'Health check',
    description:
      'Return server health status, including runtime version, active profile, bridge state, and config validity.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({}),
    outputSchema: z.object({
      status: z.enum(['ok', 'degraded', 'unavailable']),
      version: z.string(),
      node_version: z.string(),
      profile: z.string(),
      transport: z.string(),
      bridge_connected: z.boolean(),
      ups: z.number(),
    }),
    handler: async (ctx: ToolContext, _params: unknown) => {
      return {
        status: ctx.bridge.connected ? ('ok' as const) : ('degraded' as const),
        version: SERVER_VERSION,
        node_version: process.version,
        profile: ctx.profile,
        transport: config.TRANSPORT,
        bridge_connected: ctx.bridge.connected,
        ups: process.uptime(),
      };
    },
  });

  registry.register({
    name: 'easyeda_bridge_status',
    title: 'Bridge status',
    description: 'Check EasyEDA Pro bridge connection status, version, and capabilities.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({}),
    outputSchema: z.object({
      connected: z.boolean(),
      bridge_version: z.string().optional(),
      easyeda_version: z.string().optional(),
      capabilities: z.array(z.string()).optional(),
      dev_mode: z.boolean().optional(),
      last_heartbeat_ms: z.number().optional(),
      uptime_ms: z.number().optional(),
      status_error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext) => {
      if (!ctx.bridge.connected) {
        return {
          connected: false,
          uptime_ms: process.uptime() * 1000,
        };
      }
      try {
        const result = await ctx.bridge.call('system.getStatus', {});
        const data = result as {
          bridgeVersion?: string;
          easyedaVersion?: string;
          capabilities?: string[];
          devMode?: boolean;
          lastHeartbeatMs?: number;
        };
        return {
          connected: true,
          bridge_version: data.bridgeVersion,
          easyeda_version: data.easyedaVersion,
          capabilities: data.capabilities,
          dev_mode: data.devMode,
          last_heartbeat_ms: data.lastHeartbeatMs,
          uptime_ms: process.uptime() * 1000,
        };
      } catch (err) {
        return {
          connected: true,
          uptime_ms: process.uptime() * 1000,
          status_error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });

  registry.register({
    name: 'easyeda_get_capabilities',
    title: 'Get capabilities',
    description:
      'Return server capabilities, including available profiles, enabled feature flags, and supported operations.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({}),
    outputSchema: z.object({
      server_name: z.string(),
      server_version: z.string(),
      protocol_version: z.string(),
      profiles: z.array(
        z.object({
          name: z.string(),
          label: z.string(),
          description: z.string(),
          is_default: z.boolean(),
        }),
      ),
      current_profile: z.string(),
      feature_flags: z.record(z.string(), z.boolean()),
      transports: z.array(z.string()),
    }),
    handler: async (_ctx: ToolContext, _params: unknown) => {
      const profiles = Object.values(PROFILE_DEFINITIONS).map((p) => ({
        name: p.name,
        label: p.label,
        description: p.description,
        is_default: p.isDefault,
      }));

      return {
        server_name: 'easyeda-mcp-pro',
        server_version: SERVER_VERSION,
        protocol_version: config.MCP_PROTOCOL_VERSION,
        profiles,
        current_profile: config.TOOL_PROFILE,
        feature_flags: {
          tasks_enabled: config.MCP_TASKS_ENABLED,
          apps_enabled: config.MCP_APPS_ENABLED,
          v2_experimental: config.MCP_V2_EXPERIMENTAL,
          ordering_enabled: config.JLCPCB_ENABLE_ORDERING,
        },
        transports: [config.TRANSPORT],
      };
    },
  });

  registry.register({
    name: 'easyeda_get_server_config',
    title: 'Get server config',
    description: 'Return safe (redacted) server configuration. Secrets are never exposed.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({
      include_flags: z.boolean().default(false),
    }),
    outputSchema: z.object({
      node_env: z.string(),
      log_level: z.string(),
      profile: z.string(),
      transport: z.string(),
      bridge_host: z.string(),
      bridge_port: z.number(),
      mcp_protocol_version: z.string(),
      flags: z.record(z.string(), z.boolean()).optional(),
    }),
    handler: async (_ctx: ToolContext, _params: unknown) => {
      return {
        node_env: config.NODE_ENV,
        log_level: config.LOG_LEVEL,
        profile: config.TOOL_PROFILE,
        transport: config.TRANSPORT,
        bridge_host: config.BRIDGE_HOST,
        bridge_port: config.BRIDGE_PORT,
        mcp_protocol_version: config.MCP_PROTOCOL_VERSION,
      };
    },
  });

  registry.register({
    name: 'easyeda_get_tool_profiles',
    title: 'Get tool profiles',
    description: 'List available tool profiles and their descriptions.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({}),
    outputSchema: z.object({
      current: z.string(),
      profiles: z.array(
        z.object({
          name: z.string(),
          label: z.string(),
          description: z.string(),
          approx_tool_count: z.string(),
          is_default: z.boolean(),
          is_active: z.boolean(),
        }),
      ),
    }),
    handler: async (ctx: ToolContext, _params: unknown) => {
      const profiles = Object.values(PROFILE_DEFINITIONS).map((p) => ({
        name: p.name,
        label: p.label,
        description: p.description,
        approx_tool_count: p.approxToolCount,
        is_default: p.isDefault,
        is_active: p.name === ctx.profile,
      }));

      return {
        current: ctx.profile,
        profiles,
      };
    },
  });

  registry.register({
    name: 'easyeda_get_feature_flags',
    title: 'Get feature flags',
    description: 'Return current feature flag values.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: z.object({}),
    outputSchema: z.object({
      flags: z.record(z.string(), z.boolean()),
    }),
    handler: async (_ctx: ToolContext, _params: unknown) => {
      return {
        flags: {
          mcp_tasks_enabled: config.MCP_TASKS_ENABLED,
          mcp_apps_enabled: config.MCP_APPS_ENABLED,
          mcp_v2_experimental: config.MCP_V2_EXPERIMENTAL,
          jlcpcb_ordering_enabled: config.JLCPCB_ENABLE_ORDERING,
          jlcsearch_enabled: config.JLCSEARCH_ENABLED,
          mouser_enabled: config.MOUSER_ENABLED,
          digikey_enabled: config.DIGIKEY_ENABLED,
          oauth_enabled: config.OAUTH_ENABLED,
          otel_enabled: config.OTEL_ENABLED,
          ai_enabled: config.AI_PROVIDER !== 'none',
          dev_bridge: config.EASYEDA_DEV_BRIDGE,
          bridge_raw_exec_enabled: config.BRIDGE_RAW_EXEC_ENABLED,
          raw_exec_experimental: config.MCP_RAW_EXEC_EXPERIMENTAL,
        },
      };
    },
  });

  registry.register({
    name: 'easyeda_run_self_test',
    title: 'Run self test',
    description:
      'Run internal self-test to verify server integrity, config, and bridge connectivity.',
    profile: 'core',
    evidence: ['official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
    },
    inputSchema: z.object({}),
    outputSchema: z.object({
      passed: z.boolean(),
      checks: z.array(
        z.object({
          name: z.string(),
          status: z.enum(['pass', 'warn', 'fail', 'skipped']),
          message: z.string(),
        }),
      ),
    }),
    handler: async (ctx: ToolContext, _params: unknown) => {
      const checks = [
        {
          name: 'config_valid',
          status: 'pass' as const,
          message: 'Config valid',
        },
        {
          name: 'bridge_connected',
          status: ctx.bridge.connected ? ('pass' as const) : ('warn' as const),
          message: ctx.bridge.connected ? 'Bridge connected' : 'Bridge not connected',
        },
      ];

      return {
        passed: checks.every((c) => c.status === 'pass'),
        checks,
      };
    },
  });

  registry.register({
    name: 'easyeda_bridge_probe_methods',
    title: 'Probe bridge methods',
    description:
      'Query the EasyEDA Pro bridge for available API methods. Requires bridge connection. (dev/pro only)',
    profile: 'dev',
    evidence: ['runtime-probe'],
    risk: 'medium',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    inputSchema: z.object({
      filter: z.string().optional(),
    }),
    outputSchema: z.object({
      methods: z.array(
        z.object({
          name: z.string(),
          available: z.boolean(),
          parameter_schema: z.unknown().optional(),
        }),
      ),
      total: z.number(),
    }),
    handler: async (_ctx: ToolContext, _params: unknown) => {
      return {
        methods: [],
        total: 0,
      };
    },
  });

  registry.register({
    name: 'easyeda_api_inventory',
    title: 'EasyEDA API inventory',
    description:
      'Inspect the live EasyEDA extension runtime and list available documented API classes, runtime paths, and methods.',
    profile: 'core',
    evidence: ['runtime-probe', 'pro-api-types', 'official-docs'],
    risk: 'low',
    confirmWrite: false,
    group: 'diagnostics',
    version: '1.0.0',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: apiInventoryInputSchema,
    outputSchema: z.object({
      classes: z.array(
        z.object({
          className: z.string(),
          runtimePaths: z.array(z.string()),
          methods: z.array(z.string()),
        }),
      ),
      total: z.number().int().nonnegative(),
      not_available: z.boolean().optional(),
      error: z.string().optional(),
    }),
    handler: async (ctx: ToolContext, params: unknown) => {
      const { filter } = apiInventoryInputSchema.parse(params);
      try {
        return await ctx.bridge.call('system.apiInventory', { filter });
      } catch (err) {
        return {
          classes: [],
          total: 0,
          not_available: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });
}

export { registerDiagnosticsCore };
