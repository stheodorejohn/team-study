# UX Audit

## Existing interaction observations
- `FlipBookViewer.tsx` uses `react-pageflip` and sets `useMouseEvents={false}`, `disableFlipByClick={true}`; it still has custom page click navigation and native event listeners around form controls.
- `QuestionInput` attaches native listeners for mouse, touch, pointer and wheel events. The callback ref does not explicitly remove listeners on detach.
- `handlePageClick` excludes some interactive elements, but gesture handling is still distributed across component and library boundaries.
- Current inputs are uncontrolled to reduce rerenders, which is reasonable for a complex flipbook, but localStorage hydration occurs after the first render. `defaultValue` and `defaultChecked` do not automatically update after hydration.
- `StudyGuideViewer.tsx` has a separate touch-swipe implementation and a second localStorage answer store. Avoid maintaining two persistence implementations.
- Public UI has bottom navigation, but the requested edit-specific navigation/save island is not present.

## Recommended participant experience

### Reading state
- Preserve page-flip animation for intentional page navigation.
- Keep answer fields visually calm, readable and tappable.
- Show a subtle edit affordance on field focus/hover or beside each answer field.
- Avoid showing multiple competing navigation controls.

### Editing state
- Clicking the edit icon enters a dedicated editing mode.
- The field receives focus; keyboard and text selection work normally.
- Flipbook drag/swipe/click-to-flip are disabled. No page-flip animation should occur when entering edit mode, typing, selecting text, scrolling or saving.
- A bottom floating action island appears with:
  - Previous field/page
  - Next field/page
  - Save
- Save writes only to IndexedDB and confirms “Saved on this device”.
- Previous/Next preserves unsaved draft text in memory and does not flip the physical page.
- On mobile, position the island above `env(safe-area-inset-bottom)`, respect keyboard/visual viewport, and ensure it does not cover the active field.
- Provide a clear close/cancel action if the user can discard a draft.

### Gesture ownership
- A dedicated page-turn surface owns horizontal page gestures only while reading.
- Text inputs, textareas, radio/checkbox labels, buttons, links, modal/drawer content and scroll regions are excluded.
- Do not rely on passive `stopPropagation` listeners as the only protection.
- Use pointer capture only on the dedicated gesture surface, axis discrimination, movement threshold and pointer cancellation.
- Prefer CSS `touch-action` to declare intended gestures. Reading text should remain vertically scrollable.
- Keyboard arrow navigation must not run while an input is focused, a dialog is open or edit mode is active.

### Cognitive-load reductions
- One primary action per state: “Edit” in reading; “Save” in editing.
- Keep the floating island compact and label icons accessibly.
- Use plain save feedback rather than modal confirmations for routine saves.
- Confirm only destructive reset/discard actions.
- Show page position in a restrained format (e.g. `3 of 8`).
- Keep scripture detail in the existing drawer; ensure its drag handle alone owns dismissal drag.
- Respect reduced-motion settings and maintain sufficient contrast and 44px touch targets.

## Accessibility checklist
- All icon-only controls have accessible names.
- Focus is visible and returns sensibly after edit mode closes.
- Dialog/drawer traps focus correctly and restores focus.
- No keyboard shortcuts override text entry or IME composition.
- Form labels are programmatically associated with controls.
- State changes (Saving/Saved/Error) are announced with a polite live region.
- Page changes are announced without excessive screen-reader noise.
- Layout works at 200% zoom and with mobile virtual keyboards.
