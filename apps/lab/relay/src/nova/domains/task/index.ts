// The task entity — its actions and read/write prism seams. Tasks have no
// single-record view, so there's no `task` action — just the collection and form.
//
//   tasks      — the collection (Open / Overdue / Done / All)
//   task.form  — create AND edit (one action; `$.saveFn` picks the write)
export { tasksAction } from './tasks.action';
export { taskFormAction } from './task.form.action';

export { tasksReads, tasksMutations } from './tasks.prism';
export { taskFormMutations } from './task.form.prism';
