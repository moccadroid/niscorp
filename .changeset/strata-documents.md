---
"@niscorp/nova": patch
"@niscorp/prism": patch
"@niscorp/moss": minor
---

Documents. Grammar sequences own document kinds and where documents nest inside them (embeddings); their migrations are document steps — a transform over one node, run by an injected evaluator (Prism, under moss). A document carries a stamp and is upgraded where it is read: `createUpgrader`, and `upgradeStore` for tables of documents. nova and Prism publish their grammars at `/migrations`. moss stamps `integration_actions` (`nisc.moss/2`), upgrades them at boot, intake and read, accepts `NiscApp.grammars`, and refuses a bundle or row written by newer grammars. `Step` is now a union of `sql` and `document`.
