# Inventory schema v1 (#245)

Machine output: `docs/research/strudel-api-coverage/inventory.json`.
Command: `npm run inventory:strudel` (implemented with this research).

The versioned report has `version`, `provenance`, `packages`, `surfaces`,
`families`, `aliasToFamily`, `aliasCollisions`, `priorities`, `unresolvedSites`,
`examples`, `corpus`, and `counts`. See [JSON Schema](inventory.schema.json).
`families[].id` is `api:<canonical spelling>`; canonical spelling is the first
registered name, otherwise the exported/prototype spelling. Exported constructor methods use
`api:Class.method`. Join ordinary runtime spellings through `aliasToFamily`
(string values), and check `aliasCollisions` before relying on an ambiguous name. Alias spellings are
in `names`; explicit registration/export aliases share a family. Overlapping
factory definitions retain separate families and appear in `aliasCollisions`;
that index is not proof of effective runtime alias ownership. A packed setter's extra event fields are not aliases.

Each family records discovered `evidence` (package path, line and discovery kind),
`availability` (bundle export / prototype / source-only / app adapter),
`catalog` owners and control bindings, `reader` observations or explicit unknown,
`generator` role/evidence or explicit unknown, `backend` evidence or explicit
unknown, and separate corpus occurrence counts for committed and pinned wild
material. A source-only candidate is not automatically loaded or unsupported.

Dispositions are deliberately multidimensional:

- Catalog ownership is declared metadata, not proof of readable syntax.
- Reader examples record module types, CODE, exact unchanged source and saved
  identity independently. A recognized literal is not arbitrary editable shape.
- Generator ownership can be infrastructure (routing, CV, setup), without a
  direct palette module. Opaque imported orbits do not acquire that authority.
- Backend source consumption is distinct from measured events/PCM and physical
  listening. Unknown is never counted as supported audio.
- Unresolved dynamic registration sites remain explicit. This is a reproducible
  bounded inventory, not proof that arbitrary JavaScript factories are enumerable.

Stable join keys for the parallel #246 study include `api:s`, `api:note`,
`api:add`, `api:cutoff` (lpf), `api:resonance` (lpq), `api:gain`, `api:attack`, `api:stack`,
`api:arrange`, `api:register`, `api:orbit`, `api:FX`, `api:scale` and
`api:voicing`. Musical prioritization groups multiple families without changing
these keys. Initial priorities: existing #242–244 nesting/branches/sections;
computed/patterned values and companion envelopes; harmonic/voicing options;
helper registrations via existing #217. The corpus will decide final ordering.
