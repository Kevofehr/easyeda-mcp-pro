import { describe, expect, it } from 'vitest';
import {
  assertSafeRuntimeSequence,
  getRuntimeSafetyPolicy,
  listRuntimeSafetyPolicies,
  RuntimeOperationSchema,
  RuntimeSafetyPolicySchema,
} from '../../../src/safety/runtime-safety.js';

describe('runtime safety policy', () => {
  it('covers every runtime operation', () => {
    const operations = RuntimeOperationSchema.options;
    const policies = listRuntimeSafetyPolicies();

    expect(policies.map((policy) => policy.operation).sort()).toEqual([...operations].sort());
    for (const policy of policies) {
      expect(RuntimeSafetyPolicySchema.parse(policy)).toEqual(policy);
    }
  });

  it('requires confirmation and verification for design mutations', () => {
    const schematic = getRuntimeSafetyPolicy('schematic_mutation');
    const pcb = getRuntimeSafetyPolicy('pcb_mutation');

    expect(schematic).toMatchObject({
      mutatesDesign: true,
      requiresConfirmWrite: true,
      supportsWriteModePlan: true,
      requiresPostApplyVerification: true,
      rollbackGuarantee: 'manual_only',
    });
    expect(pcb.safeSequence).toContain('drc');
  });

  it('treats project save as explicit persistence with human approval', () => {
    const save = getRuntimeSafetyPolicy('project_save');

    expect(save.mutatesDesign).toBe(false);
    expect(save.persistsDesignState).toBe(true);
    expect(save.requiresConfirmWrite).toBe(true);
    expect(save.humanApprovalRequired).toBe(true);
  });

  it('treats artifact export as file output rather than design mutation', () => {
    const exportPolicy = getRuntimeSafetyPolicy('artifact_export');

    expect(exportPolicy.mutatesDesign).toBe(false);
    expect(exportPolicy.writesArtifacts).toBe(true);
    expect(exportPolicy.requiresConfirmWrite).toBe(false);
    expect(exportPolicy.rollbackGuarantee).toBe('artifact_only');
  });

  it('does not promise automatic undo or rollback', () => {
    expect(getRuntimeSafetyPolicy('undo').rollbackGuarantee).toBe('none');
    expect(getRuntimeSafetyPolicy('rollback').rollbackGuarantee).toBe('none');
  });

  it('reports missing safe-sequence steps', () => {
    const result = assertSafeRuntimeSequence('project_save', ['verify_dirty_state']);

    expect(result.ok).toBe(false);
    expect(result.missingSteps).toEqual(['human_approval', 'apply_save', 'read_back_status']);
  });
});
