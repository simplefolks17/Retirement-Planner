// useDialogBehaviour — the shared modal-dismissal/focus behaviour (BUG-50).
//
// Before this hook, none of Horizon's three overlays (ConfirmModal,
// LifeEventSheet, ApplyPreviewModal — the last delegating its chrome to the
// first) handled Escape, carried `role="dialog"`, or moved focus on open. A
// keyboard user could open one and have focus stranded on the element behind
// the backdrop, with no key that closes it.
//
// Returns a ref to put on the dialog CARD (the element inside the backdrop).
// The caller pairs it with `role="dialog" aria-modal="true" aria-labelledby=…`,
// `tabIndex={-1}` (so the card itself can receive programmatic focus), and
// spreads `escapeProps` onto the same element.
//
// What it does:
//   1. moves focus into the card on open;
//   2. closes on Escape — via BOTH the card's own React onKeyDown (the path that
//      fires in practice, since focus is inside the card) and a document-level
//      listener (the safety net for when focus has left the card);
//   3. traps Tab/Shift+Tab within the card's own focusable elements, so
//      keyboard focus can never escape to the page behind the backdrop while
//      the dialog is open (CodeRabbit, PR #66 round 2 — this was the one
//      documented gap left after the initial Escape/focus-in pass; see the
//      note below on why it went in as a follow-up, not in that first pass);
//   4. restores focus to whatever was focused before the dialog opened.
//
// The Tab trap needed a LIVE DOM to enumerate tabbables and verify against —
// this repo's default `npm test` suite runs with `environment: "node"`
// (react-test-renderer, no real `document`), which is why it was deliberately
// deferred out of the first pass rather than shipped untested. Implemented
// here now and verified with a live Chromium session against the running dev
// server (`.claude/skills/verifier-browser.cjs`'s own pattern) — see
// docs/BUGS.md's BUG-122-batch entry for the exact verification steps.

import { useEffect, useRef, useCallback } from "react";

// The standard "interactive by default" selector list — good enough for every
// element this codebase's dialogs actually render (buttons, text/number
// inputs, links with an href). Excludes elements hidden via `display:none`
// (offsetParent is null for those) so a conditionally-rendered footer button
// never becomes a phantom trap boundary.
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function getTabbables(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => el.offsetParent !== null);
}

export function useDialogBehaviour(onClose) {
  const cardRef = useRef(null);

  // The latest handler, kept in a ref so the mount-only effect below never needs
  // it in a dependency array. Without this, a caller passing an inline arrow
  // (every call site does) would re-run the effect on EVERY render — and
  // re-focusing the card each render would yank focus out of the inputs inside
  // it on every keystroke (LifeEventSheet re-renders on each character typed).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previouslyFocused = document.activeElement;
    cardRef.current?.focus?.({ preventScroll: true });

    const onDocKeyDown = (e) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocKeyDown);
      if (typeof previouslyFocused?.focus === "function") {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === "Escape") {
      // Stops the native event before it reaches the document listener above,
      // so the two mechanisms can never both fire for one keypress.
      e.stopPropagation?.();
      onCloseRef.current?.();
      return;
    }
    if (e.key !== "Tab") return;
    const tabbables = getTabbables(cardRef.current);
    if (tabbables.length === 0) {
      // Nothing tabbable inside the card at all — keep focus pinned on the
      // card itself rather than letting Tab fall through to the page.
      e.preventDefault?.();
      return;
    }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = typeof document !== "undefined" ? document.activeElement : null;
    // Wrap at the edges only — every Tab in between is native browser
    // behaviour, untouched.
    //   Shift+Tab from `first` (or from outside the tracked list — e.g. still
    //     sitting on the card's own tabIndex={-1} root right after open, the
    //     one case native Tab-order does NOT already land correctly, since
    //     Shift+Tab off a tabIndex={-1} element goes to whatever precedes it
    //     in the OVERALL document, which is behind the backdrop) wraps to `last`.
    //   Tab from `last` wraps to `first`. (Tab forward from the card root
    //     needs no special case — a tabIndex={-1} element is out of the
    //     natural sequence, so the browser's own next-tabbable search already
    //     lands on `first` with no help.)
    if (e.shiftKey) {
      if (active === first || !tabbables.includes(active)) {
        e.preventDefault?.();
        last.focus?.();
      }
    } else if (active === last) {
      e.preventDefault?.();
      first.focus?.();
    }
  }, []);

  return { cardRef, escapeProps: { onKeyDown } };
}
