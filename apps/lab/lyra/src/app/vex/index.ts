import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { studioCurrent, membersActiveCount, checkInsTodayCount } from './studio.entries';
import { revenueAtRisk, revenueCommitted, revenueExpected, revenueLeaving } from './forecast.entries';
import { sessionsToday, sessionsUpcoming, programsList } from './schedule.entries';
import { sessionAttending, sessionDetail } from './session.entries';
import { membersList, membersMatching, memberById, plansList } from './member.entries';
import { memberEnd, memberReactivate, memberUpdate } from './member.mutations';
import { studioSetTheme, themeCurrent, themesList } from './theme.entries';
import { bookableForSession, bookingCancel, bookingCreate, checkInMark, rosterForSession, walkInsToday } from './desk.entries';
import {
  programCreate,
  programUpdate,
  sessionCancel,
  sessionRestore,
  teachersList,
  templateById,
  templateCreate,
  templateRestore,
  templateRetire,
  templateUpdate,
  templatesList,
  eventCreate,
} from './timetable.entries';
import { staffById, staffCreate, staffDeactivate, staffList, staffReactivate, staffSetRole } from './staff.entries';
import { bookClass, cancelMyBooking, myBookedSessions, myBookings, myCard } from './me.entries';
import { attendedOnDay, membersLapsedAway, bookingsToday, enrolmentsStarting, membershipsEnded, membershipsPaused, subscriptionsEnding, automationCreate, automationUpdate, automationsList, bookingsOnDay, joinedRecently, lapseTrial, notificationsRecent, notify, trialsDue, waitingForASeat } from './tide.entries';
import { courseCreate, courseRestore, courseRetire, courseRoster, courseUpdate, coursesList, enrolMember, enrolmentsForMember, joinCourse, leaveCourse, myEnrolments, withdrawMember } from './course.entries';
import { membershipCreate, personByEmail, personCreate } from './intake.entries';
import { leadSetStatus, leadsBySource, leadsList } from './lead.entries';
import { addonInstall, addonReenable, addonUninstall, addonsInstalled, addonsList } from './addon.entries';
import { attendanceByHour, attendanceByProgram, attendanceByWeek, membersByStatus, planCreate, planRestore, planRetire, planUpdate, planUptake } from './reports.entries';

// THE APP'S ENTIRE API SURFACE, in one list.
//
// Warm-only: these are seeded into vex_cache at boot, served locked and
// replay-only, and no LLM hooks are wired (D3). An unknown fingerprint is a 500
// rather than a silent generate — enforced twice, by the lock and by the
// absence of a generator.
//
// Which means this file is the honest answer to "what can this application ask
// the database". Not "what could it" — what it does. Adding a read is adding a
// line here, and a screen that wants something not on this list has to say so
// out loud.
export type CacheEntry = SeedEntry;
export type MutationEntry = SeedMutation;

export const ENTRIES: CacheEntry[] = [
  // the studio and its headline figures
  studioCurrent,
  membersActiveCount,
  checkInsTodayCount,
  revenueExpected,
  revenueCommitted,
  revenueLeaving,
  revenueAtRisk,
  // the timetable, as classes happen
  sessionsToday,
  // one class, and who is in it
  sessionDetail,
  sessionAttending,
  sessionsUpcoming,
  programsList,
  // the roll
  addonsList,
  addonsInstalled,
  leadsList,
  leadsBySource,
  membersList,
  membersMatching,
  memberById,
  plansList,
  // the look
  themeCurrent,
  themesList,
  // the front desk
  rosterForSession,
  walkInsToday,
  bookableForSession,
  // the timetable, as rules
  templatesList,
  templateById,
  teachersList,
  // who works here
  staffList,
  staffById,
  myCard,
  myBookings,
  myBookedSessions,
  coursesList,
  courseRoster,
  enrolmentsForMember,
  myEnrolments,
  trialsDue,
  bookingsOnDay,
  notificationsRecent,
  automationsList,
  joinedRecently,
  attendedOnDay,
  waitingForASeat,
  bookingsToday,
  subscriptionsEnding,
  membershipsEnded,
  enrolmentsStarting,
  membershipsPaused,
  membersLapsedAway,
  // signing somebody up
  personByEmail,
  // the view from above — every one grouped on a denormalised bucket
  attendanceByHour,
  attendanceByWeek,
  attendanceByProgram,
  membersByStatus,
  planUptake,
];

// Every write the app can make. Replay-only forever: never generated, linted at
// seed, and the statement lives server-side where a request cannot see it.
export const MUTATION_ENTRIES: MutationEntry[] = [
  // enquiries
  leadSetStatus,
  addonInstall,
  addonReenable,
  addonUninstall,
  // the roll
  memberUpdate,
  memberEnd,
  memberReactivate,
  // the look
  studioSetTheme,
  // the front desk
  checkInMark,
  bookingCreate,
  bookingCancel,
  // the timetable
  templateCreate,
  templateUpdate,
  templateRetire,
  templateRestore,
  sessionCancel,
  sessionRestore,
  programCreate,
  programUpdate,
  // who works here — the only writes that change what somebody else may do
  bookClass,
  cancelMyBooking,
  lapseTrial,
  notify,
  automationCreate,
  automationUpdate,
  courseCreate,
  courseUpdate,
  courseRetire,
  courseRestore,
  joinCourse,
  leaveCourse,
  eventCreate,
  enrolMember,
  withdrawMember,
  staffCreate,
  staffSetRole,
  staffDeactivate,
  staffReactivate,
  // signing somebody up — see intake.entries.ts for why these are two
  personCreate,
  membershipCreate,
  // what the studio sells
  planCreate,
  planUpdate,
  planRetire,
  planRestore,
];
