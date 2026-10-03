---
'@niscorp/tide': patch
---

`load` refuses under the code of what it found: `unknown_effect` for a reflex naming an unregistered effect, `unknown_reflex` for one watching the run of a reflex that is not there, `unguarded_cycle` for an unguarded cycle. Every refusal was reported as `unguarded_cycle`. `details.refusals` lists each reason with its code (`details.errors` is unchanged), and `GraphReport` carries the same list.
