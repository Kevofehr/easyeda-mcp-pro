import { type EnvConfig } from './env.js';

export interface FeatureFlags {
  mcpTasksEnabled: boolean;
  mcpAppsEnabled: boolean;
  mcpV2Experimental: boolean;
  jlcpcbOrderingEnabled: boolean;
  jlcsearchEnabled: boolean;
  mouserEnabled: boolean;
  digikeyEnabled: boolean;
  oauthEnabled: boolean;
  otelEnabled: boolean;
  aiEnabled: boolean;
  devBridge: boolean;
  bridgeRawExecEnabled: boolean;
  rawExecExperimental: boolean;
}

export function loadFeatureFlags(config: EnvConfig): FeatureFlags {
  return {
    mcpTasksEnabled: config.MCP_TASKS_ENABLED,
    mcpAppsEnabled: config.MCP_APPS_ENABLED,
    mcpV2Experimental: config.MCP_V2_EXPERIMENTAL,
    jlcpcbOrderingEnabled: config.JLCPCB_ENABLE_ORDERING,
    jlcsearchEnabled: config.JLCSEARCH_ENABLED,
    mouserEnabled: config.MOUSER_ENABLED,
    digikeyEnabled: config.DIGIKEY_ENABLED,
    oauthEnabled: config.OAUTH_ENABLED,
    otelEnabled: config.OTEL_ENABLED,
    aiEnabled: config.AI_PROVIDER !== 'none',
    devBridge: config.EASYEDA_DEV_BRIDGE,
    bridgeRawExecEnabled: config.BRIDGE_RAW_EXEC_ENABLED,
    rawExecExperimental: config.MCP_RAW_EXEC_EXPERIMENTAL,
  };
}
