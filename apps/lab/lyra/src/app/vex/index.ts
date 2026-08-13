import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { studioCurrent, membersActiveCount, checkInsTodayCount } from './studio.entries';
import { revenueAtRisk, revenueCommitted, revenueExpected, revenueLeaving } from './forecast.entries';
import { sessionsToday, sessionsUpcoming, programsList } from './schedule.entries';
import { sessionAttending, sessionDetail } from './session.entries';
import { peopleList, peopleCount, personById, offeringsList, offeringOptions, offeringsOnSale } from './member.entries';
import { personAnchorUpdate } from './member.mutations';
import { subscriptionAssert, subscriptionBillable, subscriptionForMember, subscriptionGiveNotice, subscriptionWithdrawNotice, subscriptionStart, subscriptionRecordPayment, subscriptionEnd, subscriptionPause, subscriptionResume, myMembership, passSell, passesForPerson } from './subscription.entries';
import { localeCurrent, studioSetLocale, studioSetTheme, themeCurrent, themesList } from './theme.entries';
import { bookableForSession, bookingCancel, bookingCreate, checkInMark, rosterForSession, walkInsToday } from './desk.entries';
import {
  programCreate,
  programUpdate,
  sessionCancel,
  sessionRestore,
  teachersList,
  templateById,
  templateCreate,
  templatesCreateEach,
  templateSetActive,
  templateUpdate,
  templatesList,
  eventCreate,
} from './timetable.entries';
import { staffById, staffCreate, staffEnroll, staffList, staffSetActive, staffSetRole } from './staff.entries';
import { bookClass, cancelMyBooking, myBookedSessions, myBookings, myCard, myPasses } from './me.entries';
import { enquiredPerson, membersLapsedAway, automationArm, automationCreate, automationUpdate, automationsList, automationRecipes, automationRuns, bookingsOnDay, joinedSubscription, followUpsOpen, notificationsUnseen, notificationsMarkSeen, outboxRecent, closeFollowUp, notify, queueMessage, trialsDue } from './tide.entries';
import { courseCreate, courseSetActive, courseRoster, courseUpdate, coursesList, enrolMember, enrolmentsForMember, joinCourse, leaveCourse, myEnrolments, withdrawMember } from './course.entries';
import { studioPersonCreate, peopleEnroll, personByEmail, personCreate } from './intake.entries';
import { addonInstall, addonUninstall, addonsInstalled, addonsList } from './addon.entries';
import { attendanceByHour, attendanceByProgram, attendanceByWeek, membersByStatus, offeringCreate, offeringSetActive, offeringUpdate, planUptake } from './reports.entries';

export type CacheEntry = SeedEntry;
export type MutationEntry = SeedMutation;

export const ENTRIES: CacheEntry[] = [
  studioCurrent,
  membersActiveCount,
  checkInsTodayCount,
  revenueExpected,
  revenueCommitted,
  revenueLeaving,
  revenueAtRisk,
  sessionsToday,
  sessionDetail,
  sessionAttending,
  sessionsUpcoming,
  programsList,
  addonsList,
  addonsInstalled,
  // The roll, lensed: the lens is a context value, not a fingerprint.
  peopleList,
  peopleCount,
  personById,
  offeringsList,
  offeringOptions,
  offeringsOnSale,
  themeCurrent,
  themesList,
  localeCurrent,
  rosterForSession,
  walkInsToday,
  bookableForSession,
  templatesList,
  templateById,
  teachersList,
  staffList,
  staffById,
  myCard,
  myPasses,
  myMembership,
  myBookings,
  myBookedSessions,
  coursesList,
  courseRoster,
  enrolmentsForMember,
  myEnrolments,
  passesForPerson,
  trialsDue,
  automationRuns,
  bookingsOnDay,
  followUpsOpen,
  notificationsUnseen,
  outboxRecent,
  automationsList,
  automationRecipes,
  joinedSubscription,
  enquiredPerson,
  membersLapsedAway,
  personByEmail,
  attendanceByHour,
  attendanceByWeek,
  attendanceByProgram,
  membersByStatus,
  planUptake,
  subscriptionForMember,
  subscriptionBillable,
];

// Every write the app can make. Replay-only forever: never generated, linted at
// seed, and the statement lives server-side where a request cannot see it.
export const MUTATION_ENTRIES: MutationEntry[] = [
  addonInstall,
  addonUninstall,
  personAnchorUpdate,
  subscriptionStart,
  subscriptionRecordPayment,
  subscriptionEnd,
  passSell,
  subscriptionGiveNotice,
  subscriptionPause,
  subscriptionResume,
  subscriptionWithdrawNotice,
  subscriptionAssert,
  studioSetTheme,
  studioSetLocale,
  checkInMark,
  bookingCreate,
  bookingCancel,
  templateCreate,
  templatesCreateEach,
  templateUpdate,
  templateSetActive,
  sessionCancel,
  sessionRestore,
  programCreate,
  programUpdate,
  bookClass,
  cancelMyBooking,
  notify,
  closeFollowUp,
  notificationsMarkSeen,
  queueMessage,
  automationCreate,
  automationUpdate,
  automationArm,
  courseCreate,
  courseUpdate,
  courseSetActive,
  joinCourse,
  leaveCourse,
  eventCreate,
  enrolMember,
  withdrawMember,
  staffCreate,
  staffEnroll,
  staffSetRole,
  staffSetActive,
  personCreate,
  studioPersonCreate,
  peopleEnroll,
  offeringCreate,
  offeringUpdate,
  offeringSetActive,
];
