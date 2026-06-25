import { z } from 'zod';

export const RuntimeOperationSchema = z.enum([
  'schematic_mutation',
  'pcb_mutation',
  'project_save',
  'artifact_export',
  'undo',
  'rollback',
]);

export type RuntimeOperation = z.infer<typeof RuntimeOperationSchema>;

export const RuntimeSafetyPolicySchema = z.object({
  operation: RuntimeOperationSchema,
  mutatesDesign: z.boolean(),
  persistsDesignState: z.boolean(),
  writesArtifacts: z.boolean(),
  requiresConfirmWrite: z.boolean(),
  supportsWriteModePlan: z.boolean(),
  requiresPreflightCheckpoint: z.boolean(),
  requiresPostApplyVerification: z.boolean(),
  humanApprovalRequired: z.boolean(),
  rollbackGuarantee: z.enum(['none', 'manual_only', 'artifact_only']),
  safeSequence: z.array(z.string()).min(1),
  notes: z.string().min(1),
});

export type RuntimeSafetyPolicy = z.infer<typeof RuntimeSafetyPolicySchema>;

export const RUNTIME_SAFETY_POLICIES: RuntimeSafetyPolicy[] = [
  {
    operation: 'schematic_mutation',
    mutatesDesign: true,
    persistsDesignState: false,
    writesArtifacts: false,
    requiresConfirmWrite: true,
    supportsWriteModePlan: true,
    requiresPreflightCheckpoint: true,
    requiresPostApplyVerification: true,
    humanApprovalRequired: true,
    rollbackGuarantee: 'manual_only',
    safeSequence: ['plan', 'preview', 'checkpoint', 'apply', 'verify', 'explicit_save'],
    notes: 'Schematic writes must be planned and verified before an explicit project save.',
  },
  {
    operation: 'pcb_mutation',
    mutatesDesign: true,
    persistsDesignState: false,
    writesArtifacts: false,
    requiresConfirmWrite: true,
    supportsWriteModePlan: true,
    requiresPreflightCheckpoint: true,
    requiresPostApplyVerification: true,
    humanApprovalRequired: true,
    rollbackGuarantee: 'manual_only',
    safeSequence: ['plan', 'preview', 'checkpoint', 'apply', 'drc', 'verify', 'explicit_save'],
    notes: 'PCB writes must be gated by DRC/manufacturing checks before an explicit project save.',
  },
  {
    operation: 'project_save',
    mutatesDesign: false,
    persistsDesignState: true,
    writesArtifacts: false,
    requiresConfirmWrite: true,
    supportsWriteModePlan: true,
    requiresPreflightCheckpoint: true,
    requiresPostApplyVerification: true,
    humanApprovalRequired: true,
    rollbackGuarantee: 'manual_only',
    safeSequence: ['verify_dirty_state', 'human_approval', 'apply_save', 'read_back_status'],
    notes:
      'Save is never implicit. It persists the current EasyEDA project state after user approval.',
  },
  {
    operation: 'artifact_export',
    mutatesDesign: false,
    persistsDesignState: false,
    writesArtifacts: true,
    requiresConfirmWrite: false,
    supportsWriteModePlan: false,
    requiresPreflightCheckpoint: false,
    requiresPostApplyVerification: true,
    humanApprovalRequired: true,
    rollbackGuarantee: 'artifact_only',
    safeSequence: [
      'preflight_checks',
      'export',
      'hash_manifest',
      'structural_validation',
      'human_review',
    ],
    notes:
      'Exports write files, not design state. Outputs still require manifest and human review.',
  },
  {
    operation: 'undo',
    mutatesDesign: true,
    persistsDesignState: false,
    writesArtifacts: false,
    requiresConfirmWrite: true,
    supportsWriteModePlan: false,
    requiresPreflightCheckpoint: true,
    requiresPostApplyVerification: true,
    humanApprovalRequired: true,
    rollbackGuarantee: 'none',
    safeSequence: ['manual_restore_only'],
    notes:
      'No stable EasyEDA undo API is guaranteed by this server. Prefer manual restore/checkpoint workflows.',
  },
  {
    operation: 'rollback',
    mutatesDesign: true,
    persistsDesignState: false,
    writesArtifacts: false,
    requiresConfirmWrite: true,
    supportsWriteModePlan: false,
    requiresPreflightCheckpoint: true,
    requiresPostApplyVerification: true,
    humanApprovalRequired: true,
    rollbackGuarantee: 'none',
    safeSequence: [
      'stop_writes',
      'restore_from_saved_project_or_backup',
      'verify_netlist',
      'verify_drc_erc',
    ],
    notes:
      'Automatic rollback is not promised. Recovery depends on saved projects, backups, or user-managed copies.',
  },
].map((policy) => RuntimeSafetyPolicySchema.parse(policy));

export function getRuntimeSafetyPolicy(operation: RuntimeOperation): RuntimeSafetyPolicy {
  const policy = RUNTIME_SAFETY_POLICIES.find((entry) => entry.operation === operation);
  if (!policy) throw new Error(`Unknown runtime operation: ${operation}`);
  return policy;
}

export function listRuntimeSafetyPolicies(): RuntimeSafetyPolicy[] {
  return [...RUNTIME_SAFETY_POLICIES];
}

export function assertSafeRuntimeSequence(
  operation: RuntimeOperation,
  completedSteps: string[],
): {
  ok: boolean;
  missingSteps: string[];
} {
  const policy = getRuntimeSafetyPolicy(operation);
  const completed = new Set(completedSteps);
  const required = policy.safeSequence.filter((step) => step !== 'apply' && step !== 'export');
  const missingSteps = required.filter((step) => !completed.has(step));
  return { ok: missingSteps.length === 0, missingSteps };
}
