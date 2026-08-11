import type { ActionDefinition } from '@niscorp/nova';
import { authLoginAction } from './actions/surfaces/auth/login.action';
import { memberChromeAction } from './actions/chrome/member.action';
import { staffChromeAction } from './actions/chrome/staff.action';
import { confirmAction, confirmInputSchema } from './actions/shared/confirm.action';
import { homeClassesAction, homeDeskAction, homeInputSchema, homeOverviewAction } from './actions/surfaces/home/home.actions';
import { peopleDetailAction, peopleDetailInputSchema, peopleFormAction, peopleFormInputSchema, peopleListAction, peopleListInputSchema, peopleSignupAction, peopleSignupInputSchema } from './actions/domains/people/people.actions';
import { leadsFormAction, leadsFormInputSchema, leadsListAction, leadsListInputSchema } from './actions/domains/people/leads.action';
import { scheduleTimetableAction, scheduleTimetableInputSchema } from './actions/domains/schedule/schedule.action';
import { scheduleSessionAction, scheduleSessionInputSchema } from './actions/domains/schedule/session.action';
import { studioSettingsAction, studioSettingsInputSchema } from './actions/domains/studio/studio.action';
import { addonsAction, addonsInputSchema } from './actions/domains/studio/addons.action';
import { deskCheckInAction, deskCheckInInputSchema } from './actions/domains/desk/desk.action';
import { automationsAction, automationsInputSchema } from './actions/domains/automations/automations.action';
import { automationFormAction, automationFormInputSchema } from './actions/domains/automations/automations.form';
import { courseFormAction, courseFormInputSchema } from './actions/domains/courses/courses.form';
import { courseRosterAction, courseRosterInputSchema } from './actions/domains/courses/courses.roster';
import { plansAction, plansInputSchema } from './actions/domains/plans/plans.action';
import { planFormAction, planFormInputSchema } from './actions/domains/plans/plans.form';
import { homeMemberAction, homeMemberInputSchema, meBookingsAction, meBookingsInputSchema, meClassesAction, meClassesInputSchema, meMembershipAction, meMembershipInputSchema } from './actions/surfaces/me/me.actions';
import { eventFormAction, eventFormInputSchema, programsAction, programsInputSchema, timetableFormAction, timetableFormInputSchema, timetableListAction, timetableListInputSchema } from './actions/domains/timetable/timetable.actions';
import { programFormAction, programFormInputSchema } from './actions/domains/timetable/programs.form';
import { staffListAction, staffListInputSchema } from './actions/domains/staff/staff.action';
import { staffFormAction, staffFormInputSchema } from './actions/domains/staff/staff.form';
import { reportsAction, reportsInputSchema } from './actions/domains/reports/reports.action';
import { retentionAction, retentionInputSchema } from './actions/domains/reports/retention.action';

// RING 1 — the action index. Every id that exists in this application, before
// any principal is considered; the charter selects from this set and never adds
// to it.
//
// The `input` schemas are attached here rather than inside each definition so a
// definition stays a plain artifact and the JSON Schema conversion stays a
// setup concern. What an opener may seed is still the action's own contract —
// this is only where the two halves are married.
export const CATALOG_DEFINITIONS: Record<string, ActionDefinition> = {
  'auth.login': authLoginAction,
  'chrome.member': memberChromeAction,
  confirm: { ...confirmAction, input: confirmInputSchema },
  'chrome.staff': staffChromeAction,
  'home.overview': { ...homeOverviewAction, input: homeInputSchema },
  'home.desk': { ...homeDeskAction, input: homeInputSchema },
  'home.classes': { ...homeClassesAction, input: homeInputSchema },
  'people.list': { ...peopleListAction, input: peopleListInputSchema },
  'leads.list': { ...leadsListAction, input: leadsListInputSchema },
  'leads.form': { ...leadsFormAction, input: leadsFormInputSchema },
  'people.detail': { ...peopleDetailAction, input: peopleDetailInputSchema },
  'people.form': { ...peopleFormAction, input: peopleFormInputSchema },
  'people.signup': { ...peopleSignupAction, input: peopleSignupInputSchema },
  'schedule.timetable': { ...scheduleTimetableAction, input: scheduleTimetableInputSchema },
  'schedule.session': { ...scheduleSessionAction, input: scheduleSessionInputSchema },
  'studio.settings': { ...studioSettingsAction, input: studioSettingsInputSchema },
  'studio.addons': { ...addonsAction, input: addonsInputSchema },
  'desk.checkin': { ...deskCheckInAction, input: deskCheckInInputSchema },
  'timetable.list': { ...timetableListAction, input: timetableListInputSchema },
  'timetable.form': { ...timetableFormAction, input: timetableFormInputSchema },
  'timetable.event': { ...eventFormAction, input: eventFormInputSchema },
  'programs.form': { ...programFormAction, input: programFormInputSchema },
  'programs.list': { ...programsAction, input: programsInputSchema },
  'plans.list': { ...plansAction, input: plansInputSchema },
  'plans.form': { ...planFormAction, input: planFormInputSchema },
  'courses.roster': { ...courseRosterAction, input: courseRosterInputSchema },
  'courses.form': { ...courseFormAction, input: courseFormInputSchema },
  'automations.form': { ...automationFormAction, input: automationFormInputSchema },
  'automations.list': { ...automationsAction, input: automationsInputSchema },
  'staff.form': { ...staffFormAction, input: staffFormInputSchema },
  'staff.list': { ...staffListAction, input: staffListInputSchema },
  'reports.overview': { ...reportsAction, input: reportsInputSchema },
  'reports.retention': { ...retentionAction, input: retentionInputSchema },
  'home.member': { ...homeMemberAction, input: homeMemberInputSchema },
  'me.classes': { ...meClassesAction, input: meClassesInputSchema },
  'me.bookings': { ...meBookingsAction, input: meBookingsInputSchema },
  'me.membership': { ...meMembershipAction, input: meMembershipInputSchema },
};

// The hubs, from the one navigation table. Registered in a loop because
// adding an area should be a row in `nav/sections.ts` and nothing else.
