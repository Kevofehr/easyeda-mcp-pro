import { describe, expect, it, vi } from 'vitest';
import { EnvSchema } from '../../../src/config/env.js';
import { registerDiagnosticsCore } from '../../../src/tools/L0_diagnostics_core.js';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { type ToolContext } from '../../../src/tools/types.js';

describe('bridge status telemetry', () => {
  it('includes local bridge diagnostics in bridge status output', async () => {
    const registry = new ToolRegistry();
    registerDiagnosticsCore(registry, EnvSchema.parse({ NODE_ENV: 'test' }));
    const bridgeCall = vi.fn(async () => ({
      bridgeVersion: '1.2.3',
      easyedaVersion: '2.0.0',
      capabilities: ['system.getStatus'],
      devMode: false,
      lastHeartbeatMs: 100,
    }));
    const context: ToolContext = {
      profile: 'core',
      bridge: {
        connected: true,
        call: bridgeCall,
        uptimeMs: 1234,
        activePort: 49620,
        lastHeartbeatMs: Date.now() - 10,
        methodRegistryHash: 'hash123',
        telemetry: { attempts: 0 },
      },
      config: {
        bridgeTimeoutMs: 1000,
        artifactDir: '.easyeda-mcp-pro/artifacts',
        bridgeHost: '127.0.0.1',
        bridgePort: 49620,
      },
      vendors: {
        lcsc: null,
        jlcpcb: null,
        mouser: null,
        digikey: null,
      },
    };

    const tool = registry.get('easyeda_bridge_status');
    const result = await tool?.handler(context, {});

    expect(result?.diagnostics).toMatchObject({
      manager_uptime_ms: 1234,
      active_port: 49620,
      method_registry_hash: 'hash123',
      reconnect: { attempts: 0 },
    });
    expect(result?.diagnostics?.heartbeat_silence_ms).toBeGreaterThanOrEqual(0);
  });
});
