---
"@niscorp/vex": patch
"@niscorp/moss": patch
---

A write can now be told to answer only the rows the caller's read rules show: `mutations: { …, answerReadableRows: true }` on the handler and on the Hono and Express adapters, and `answerReadableRows: true` in moss's runtime for its `/api/vex` surfaces. It is off by default, and with it off a write runs and answers exactly as before.
