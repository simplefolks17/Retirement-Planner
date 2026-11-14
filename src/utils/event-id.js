// UI plumbing, NOT model code (CLAUDE.md rule 6: src/model/ is pure functions). It holds
// module-level mutable state and reads Date.now()/Math.random(), so it lives here. No
// src/model/ function calls it; the panels and App.jsx mint ids at the moment a user adds an event.
//
// BUG-163: the ONE way an event/conversion-event id is minted. Always a STRING (so id
// lookups by `===` never miss on a number-vs-string mismatch) and unique even for many
// calls in the same millisecond (a monotonic per-session counter is part of the id, with
// time + randomness so ids from different sessions/reloads stay distinct too).
let _eventIdSeq = 0;
export function mintEventId() {
  _eventIdSeq += 1;
  return `ev-${Date.now().toString(36)}-${_eventIdSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
