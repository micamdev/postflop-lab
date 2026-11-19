# Visual adjustments after the redesign: design

Follows the user's first look at the redesign (PR #23 to #26). It is one branch, `feat/ui-polish`, with one PR to `dev`.

## Intent

The redesign works, but it still lacks density and calm. The buttons are too big. The turquoise is too bright on black. The node's strategy bar takes a whole band. The grid stretches on wide screens. In Compare, the two ranges sit right next to each other. The reference is GTO Wizard: dense, with neutral selections and colour reserved for information.

- **Goal:** a more professional rendering, with no change in behaviour.
- **Anti-goal:**
  - losing a feature or a control;
  - creating a bug (the user's standing rule).

## Decisions

1. **Smaller controls.**
   - `UiButton` md: 28 px (`h-7`, `text-xs`); `UiButton` sm: 24 px.
   - `UiSegmented`: `py-0.5`, `text-xs`, so 24 px of content.
   - The top-bar Solve button keeps its current size (`h-8`), as the only large button.
2. **Primary colour: B, muted lavender `#7b72c0`** (the user's choice).
   - `--accent` changes to this value. For text and links on a dark background, a lighter variant `--accent-ink` `#a9a2dc` is added, because `#7b72c0` lacks contrast on `#151517`.
   - The selected item of a `UiSegmented` becomes neutral: light grey on grey, `bg-[#3a3a40] text-ink`, no accent.
   - The accent is kept only for:
     - the primary button (Solve);
     - the active node's outline;
     - statuses and badges;
     - links;
     - focus.
   - Every hard-coded `bg-accent text-white` is reviewed in the same way.
3. **Node strategy in the right panel.**
   - The full-width `NodeStrategyBar` is removed.
   - Above the Summary, in the right column of Strategy mode, sits a block of compact action cards. Each card has a coloured left border, the action name, the frequency in large type and the number of combos.
   - Under the cards, a 4 px proportional bar.
   - In Equity and Compare modes, the same block sits at the top of the right column, if it exists.
   - "No hands for this player at this node" moves into this block.
4. **Square grid.**
   - The 13×13 grid of `ResultBasics` keeps a 1:1 ratio.
   - Its side is `min(available height, available width)`. The width left over goes to the right panel (Summary).
   - This applies to Strategy and Equity. In Compare, each grid is square in its half.
5. **Compare: statistics in the middle.**
   - New order: OOP grid | `ResultCompare` column (≈240 px) | IP grid.
   - The OOP/IP labels, with their colours, sit above each grid.

Text sketch of Strategy mode:

```
[toolbar]
┌──────── square grid ────────┐ ┌ Check  14.2% ┐┌ Bet 30 85.8% ┐
│                              │ │ 6.1 combos   ││ 36.9 combos  │
│                              │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ (4 px)
│                              │ SUMMARY  Bars … Show …
│                              │ Hand Strategy Weight EQ EV …
└──────────────────────────────┘
```

## Constraints

- No change to the engine, the Rust side or the stores. Everything stays in the Vue components, `style.css` and `tailwind.config.cjs`.
- Hover, lock, Suits, Normalized/Absolute/Full and chance mode keep working as they do today.
- The minimum width is 1280 px: at that width, the right panel keeps at least 380 px.

## Approaches considered

- **Retouching the existing components (chosen):** the UI kit and the result components already centralise the styles. That is little code and little risk.
- **A new results layout:** rejected, because it adds risk for no visible gain.

## Left to the builder

- The exact spacing and the colour of the action cards' left border (they reuse `action-colors.ts`).
- How the square size is computed: CSS `aspect-ratio` plus `max-height`, or a `ResizeObserver`.
