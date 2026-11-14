// Shared by input-propagation.test.js and bounds-invariant.test.js (R-13, Opus review 2026-11-14).
//
// Enumerates EVERY editable `{ value, set }` field reachable anywhere in the props App hands the
// Horizon shell, not a hard-coded list of bundles. The previous guards walked nine named bundles
// and silently skipped five user-editable fields under `conversionView` (the window ages and the
// working-year conversion-event rows), one of which hid a live coupling gap (BUG-175). A field
// added anywhere tomorrow is picked up with no edit to either guard.
//
// Paths use dots for objects and array indexes alike ("conversionView.events.rows.0.ageField"), so
// `path.split(".").reduce((o, k) => o?.[k], props)` reads them back.
export function allFields(props) {
  const out = [];
  const seen = new WeakSet();
  const walk = (o, path, depth) => {
    if (!o || typeof o !== "object" || depth > 8 || seen.has(o)) return;
    seen.add(o);
    if (typeof o.set === "function" && "value" in o) { out.push({ path, field: o }); return; }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") walk(v, path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(props, "", 0);
  return out;
}
