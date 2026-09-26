import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { departmentsAll, departmentsTally, memberAssign, memberUnassign, membersAssigned, membersUnassigned } from '@lyceum/app/vex/member.entries';
import { vexOver } from '../vex-over';

// ASSIGNMENT. Everybody not yet in a department, in the order they arrived, is
// put in one — and that IS their new role: one write, AS THE SPEAKER over the
// speaker's own session (the charter grants them `members.write.update`), then
// `invalidateIdentity`, which forgets who they were and rebuilds their live
// shell from the new row, carrying their open connection across. Their phone
// changes department without anybody signing in again.
//
// Which department: the one with the fewest people so far, ties broken by the
// departments' order. The CHOICE is the only code here; Jev can replace it
// (a `choice` per person, the departments' remits as criteria) and the write
// and the re-role stay as they are.

const DepartmentsSchema = z.array(z.object({ department_id: z.string() }));
const MembersSchema = z.array(z.object({ member_id: z.string() }));
const TallySchema = z.array(z.object({ department_id: z.string(), size: z.number() }));

const rows = async <T>(schema: z.ZodType<T>, read: Promise<unknown>): Promise<T> => schema.parse((await read) ?? []);

const emptiest = (departments: readonly { department_id: string }[], sizes: ReadonlyMap<string, number>): string => {
  const [first, ...rest] = departments;
  if (first === undefined) throw new Error('There are no departments to assign to.');
  return rest.reduce((best, department) => ((sizes.get(department.department_id) ?? 0) < (sizes.get(best) ?? 0) ? department.department_id : best), first.department_id);
};

export const assignmentFunctions = (session: FunctionSession, server: () => MossServer): Record<string, FunctionHandler> => {
  const vex = vexOver(session.wire);
  return {
    'speaker.assign': async () => {
      const departments = await rows(DepartmentsSchema, vex(departmentsAll.fingerprint));
      const waiting = await rows(MembersSchema, vex(membersUnassigned.fingerprint));
      const tally = await rows(TallySchema, vex(departmentsTally.fingerprint));
      const sizes = new Map(tally.map((row) => [row.department_id, row.size]));

      const assigned: { memberId: string; departmentId: string }[] = [];
      for (const { member_id: memberId } of waiting) {
        const departmentId = emptiest(departments, sizes);
        await vex(memberAssign.fingerprint, { memberId, departmentId, at: new Date().toISOString() });
        sizes.set(departmentId, (sizes.get(departmentId) ?? 0) + 1);
        server().invalidateIdentity(memberId);
        assigned.push({ memberId, departmentId });
      }
      return { assigned };
    },

    // UNASSIGNING — for testing: everybody back out, re-roled the same way, so
    // every open phone loses its department where it stands.
    'speaker.unassign': async () => {
      const assigned = await rows(MembersSchema, vex(membersAssigned.fingerprint));
      for (const { member_id: memberId } of assigned) {
        await vex(memberUnassign.fingerprint, { memberId });
        server().invalidateIdentity(memberId);
      }
      return { unassigned: assigned.length };
    },
  };
};
