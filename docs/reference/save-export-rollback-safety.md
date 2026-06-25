# Save Export Undo and Rollback Safety

EasyEDA project state changes are handled with explicit gates. This server does not promise an automatic cross-runtime undo or rollback API.

## Required sequence

For schematic or PCB mutations:

1. Use `writeMode=plan` or `writeMode=preview`.
2. Create a user-managed checkpoint or backup of the project.
3. Apply only after human approval with `confirmWrite=true`.
4. Run read-only verification such as netlist validation, ERC, DRC, BOM checks, or export checks.
5. Save only with an explicit `easyeda_project_save` call.

## Save

`easyeda_project_save` persists the current EasyEDA project state. It is never implicit and requires `confirmWrite=true`.

## Export

Export tools write artifacts, not design state. Exports still require hash manifests, structural validation, and human review before manufacturing use.

## Undo and rollback

Automatic undo or rollback is not guaranteed. Recovery depends on saved EasyEDA projects, backups, disposable test projects, or user-managed copies.

The machine-readable policy lives in `src/safety/runtime-safety.ts` and is covered by unit tests.
