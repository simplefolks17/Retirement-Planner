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
//      listener (the safety net for when focus has left the card, since this
//      hook deliberately does NOT install a full focus trap). The React handler
//      calls stopPropagation, so the native event never reaches the document
//      listener and onClose is invoked exactly once, never twice;
//   3. restores focus to whatever was focused before the dialog opened.
//
// Deliberately NOT included: a full Tab-cycling focus trap. It is the remaining
// nice-to-have on this surface; the value/risk trade was judged unfavourable in
// one pass (it needs a live DOM to enumerate tabbables, which this repo's
// `environment: "node"` test setup cannot exercise, so it would ship untested).
// The document-level Escape listener above is what keeps the dialog dismissible
// in the meantime.

import { useEffect, useRef, useCallback } from "react";

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
    if (e.key !== "Escape") return;
    // Stops the native event before it reaches the document listener above, so
    // the two mechanisms can never both fire for one keypress.
    e.stopPropagation?.();
    onCloseRef.current?.();
  }, []);

  return { cardRef, escapeProps: { onKeyDown } };
}
