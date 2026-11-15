import { isShellProject, loadProject, say } from '../project';
import type { CommandOptions } from '../project';

export const migrate = async (options: CommandOptions): Promise<void> => {
  const project = await loadProject(options.root);
  if (isShellProject(project) || project.app === undefined || project.runtime === undefined) {
    throw new Error('nisc: `nisc migrate` needs `app` and `runtime` in nisc.config.ts — the manifest, and the environment it runs on.');
  }
  const { migrateTables, tableStatus } = await import('@niscorp/moss');
  const print = say(options);
  const isDryRun = options.dryRun === true;
  const runtime = await project.runtime();
  try {
    if (runtime.migrations === 'apply') {
      print("nisc: this runtime's database starts empty every time (migrations: 'apply') — what is applied here is gone when the command ends. A real database is migrated by pointing runtime at it.");
    }
    if (options.status === true) {
      const plan = await tableStatus(runtime, project.app);
      print(`nisc: applied ${Object.entries(plan.applied).map(([sequence, n]) => `${sequence} ${n}`).join(', ')}`);
      print(plan.pending.length === 0 ? 'nisc: nothing pending' : `nisc: ${plan.pending.length} pending`);
      for (const migration of plan.pending) print(`  ${migration.ref}  ${migration.description}`);
      if (plan.problems.length > 0) {
        const problems = plan.problems.map((problem) => `  ${problem.code}: ${problem.detail}`);
        throw new Error(['nisc: this database cannot be migrated or booted as it is:', ...problems].join('\n'));
      }
      return;
    }
    const report = await migrateTables(runtime, project.app, { ...(isDryRun ? { dryRun: true } : {}), ...(options.allowRemoval === true ? { allowRemoval: true } : {}) });
    if (report.applied.length === 0) print('nisc: nothing to migrate');
    else print(isDryRun ? `nisc: would apply ${report.applied.length} — rolled back, nothing changed` : `nisc: applied ${report.applied.length}`);
    for (const migration of report.applied) print(`  ${migration.ref}  ${migration.description}`);
    if (report.removed.length > 0) print(`nisc: this run removes ${report.removed.join(', ')}`);
    if (report.retyped.length > 0) print(`nisc: this run changes the type of ${report.retyped.join(', ')}`);
    if (report.alreadyBroken.length > 0) print('nisc: not fitting before this run either, and seeded as they are — said, not refused:');
    for (const entry of report.alreadyBroken) print(`  ${entry}`);
  } finally {
    await runtime.close?.();
  }
};
