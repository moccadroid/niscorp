---
"@niscorp/moss": patch
---

The docs now say plainly that time the app is down counts as unused for `runtime.artifactsUnusedMs`, so a long downtime lets the boot sweep delete what nobody used since. `runtime.artifactsUnusedSinceStart: true` counts that time only since the server started; the default is unchanged.
