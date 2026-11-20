# Spots: load a whole preflop situation into the Setup

## Intent

Setting up a solve today means loading two ranges one by one, then typing the pot, the
stack and the rake by hand. Those three numbers follow from the preflop line (who opened to
how much, who 3-bet to how much, who called), and the right range depends heavily on the
sizes faced: a call vs a 3-bet to 8bb and a call vs a 3-bet to 13.5bb are different ranges.
Getting the pot or the stack wrong silently gives a wrong solve.

A **spot** is the situation at the start of the flop: the two ranges, the pot, the effective
stack, the rake, and a reminder of the line that led there. Loading a spot fills all of it in
one click and keeps the line visible, so the user always knows which sizes the ranges assume.

The user studies Cash 6-max NL10, 100bb, "with cold calls" (GTO Wizard), and has a personal
pack of 110 preflop spots read from screenshots, in the private repo `micamdev/poker-ranges`.
That repo generates the spot pack; this app only imports and uses spot packs.

## Vocabulary (decided)

- **Range:** one range, as today. Range-by-range loading stays as it is.
- **Tree:** how the hand is played postflop: bet and raise sizes, all-in thresholds,
  merging, added and removed lines.
- **Spot:** OOP range, IP range, starting pot, effective stack, rake %, rake cap, and the
  preflop line. **The spot owns the pot, the stack and the rake.**

## Goals

1. **A "Spots" tab** in the saved explorer, next to Ranges and Trees, with the same features:
   folders (up to 4 levels, as today), search, rename, delete, Import JSON…, Export JSON….
2. **Loading a spot** (click/double-click as for a range or a tree) sets the OOP range, the IP
   range, the starting pot, the effective stack, the rake % and the rake cap.
3. **The line stays visible** in the Setup while the spot is loaded: the spot's name, the line
   (for example `BTN 2.5 · BB 13.5 · BTN call`), the pot and the stack in big blinds. When the
   ranges, the pot, the stack or the rake are edited afterwards, it shows the spot as modified
   (like ranges and trees today).
4. **Trees do not undo a spot.** While a spot is loaded, loading a tree applies its bet sizes
   and other settings but keeps the spot's pot, stack, rake % and rake cap. The tree's
   "modified" mark then ignores those four fields. Without a spot, trees behave exactly as
   today (saved trees keep their pot, stack and rake; nothing to migrate).
5. **A solved spot remembers its line.** Saving a solution stores the spot's name and line in
   its metadata; loading the solution later shows them again (in the same reminder).
   Solutions saved before this feature, or without a spot, show nothing new.

## Rules settled after review (the author's calls; the user can overrule)

1. **Trees with hand-edited lines.** A tree's added or removed lines hold exact amounts made
   for its own pot and stack (`hasManualEdits` locks those fields today). Whenever a spot's
   pot or stack would go under such lines (loading a spot over such a tree, or loading such
   a tree while a spot is loaded), the app asks first: "This tree's edited lines were made
   for pot X and stack Y; they will be removed." Continue removes the edited lines and loads;
   Cancel changes nothing. Nothing happens silently.
2. **A modified spot in a solution.** The solution stores the spot's name, line and
   positions, plus `modified: true` if the ranges, pot, stack or rake no longer matched the
   spot **when the solve started** (captured then, like the setup used for the solve). The
   reminder then shows the line marked as modified.
3. **After loading a solution, the spot is shown, not loaded.** The reminder displays the
   stored name and line (and "modified" if stored); goal 4's tree rule does not apply and
   no edit tracking runs against it. Loading a solution without a spot shows no reminder.
4. **Batch solves** save the spot metadata like a single solve (they solve the current
   setup). The Library list and flop reports show nothing new for now.
5. **Saving a tree while a spot is loaded.** Overwriting an existing saved tree keeps that
   tree's own pot, stack, rake % and rake cap; only its other fields are updated. A new tree
   saved from "Save current" takes the current values.

## Non-goals

- Navigating a preflop tree inside the app (pick UTG raise → BB 3-bet → call and derive the
  spot). Possible later, on top of this.
- Multiway spots: the solver is heads-up only. Packs contain heads-up lines only.
- Using the packs in poker.mica.app (separate project).
- Changing how ranges or trees are saved.

## Anti-goals

- **No GTO Wizard-derived data in this repository, in the app bundle, or in tests.** The app
  ships no spots; tests use made-up ranges. The pack stays in the private repo.
- A spot must never leave the Setup in a state where the pot or stack silently differs from
  the reminder: if they differ, the reminder says the spot was modified.

## Spot pack format

Same envelope as the ranges export, so the explorer's import/export code is shared:

```json
{
  "version": 2,
  "name": "spots",
  "data": [
    { "path": ["NL10 - 100bb (cold calls)"], "isGroup": true },
    { "path": ["NL10 - 100bb (cold calls)", "3-bet pots"], "isGroup": true },
    {
      "path": ["NL10 - 100bb (cold calls)", "3-bet pots", "BTN open, BB 3-bet, BTN call"],
      "isGroup": false,
      "value": {
        "oopRange": "AA,KK,…",
        "ipRange": "QQ:0.5,…",
        "startingPot": 280,
        "effectiveStack": 865,
        "rakePercent": 5,
        "rakeCap": 150,
        "line": "BTN 2.5 · BB 13.5 · BTN call",
        "positions": ["BB", "BTN"]
      }
    }
  ]
}
```

- Amounts use the app's units (tenths of a big blind, as the Setup: pot 55 = 5.5bb).
- `positions`: the OOP player then the IP player, for the reminder.
- The top-level `meta` of the source pack (cash, 6-max, 100bb, NL10, rake 5% cap 15bb, open
  sizes) lives in `poker-ranges`; the app needs only the per-spot values above.
- An import with an invalid spot (missing range, non-positive pot or stack, stack + pot
  inconsistent with nothing) rejects that item with a message naming it; valid items import.
  The exact checks are the builder's call; they must at least catch a missing field and a
  non-numeric amount.

## Which spots the generator writes (in `poker-ranges`, not this repo)

Heads-up lines only, everyone else folding, dead money in the pot (blinds and folded
openers or callers):

| Folder | Line | OOP / IP ranges from |
|---|---|---|
| Single raised pots | X open, Y call | opener's open range; Y's call vs X's open |
| 3-bet pots | X open, Y 3-bet, X call | Y's 3-bet range; X's call vs Y's 3-bet |
| 4-bet pots | X open, Y 3-bet, X 4-bet, Y call | X's 4-bet range; Y's call vs X's 4-bet |
| Squeeze pots | X open, Y call, Z squeeze, one of X/Y calls | Z's squeeze range; the caller's call vs the squeeze |

OOP/IP follows postflop order (SB, BB, UTG, HJ, CO, BTN). The SB limp line is not captured
and is left out. Ranges are the absolute ranges the pack already computes (previous range ×
the action's share). Pot = blinds + every amount put in; stack = 100bb minus what the
remaining players put in (equal for both). The rake is the NL10 structure (5%, cap 15bb →
5 and 150 in app units).

## Constraints

- English UI, GTO Wizard naming for poker terms, the app's Graphite look and existing
  components (explorer rows, tags, menus).
- Saved data in IndexedDB (Dexie): a new `spots` table needs a schema version bump that keeps
  the `ranges` and `configurations` tables untouched.
- The solution file's metadata (`SolutionMeta`, Rust) gains an optional field with
  `#[serde(default)]`, readable by older code paths and absent in older files.
- Tests for the pure parts (spot value validation, the tree-load rule with a spot, the
  modified marks); local checks then green CI; one PR to `dev`, reviewed before merge.

## Approaches (considered; A chosen by the user)

- **A. Spots as their own saved items (chosen).** A third explorer tab; each spot holds its
  two ranges and its numbers. Simple, reuses the explorer, each spot is self-contained. Cost:
  ranges are copied into spots (a range also saved under Ranges is a separate copy).
- **B. Spots that point to saved ranges.** No copies, but renaming or deleting a range would
  silently break spots.
- **C. A preflop tree navigator in the app.** Most powerful (any line), but a whole preflop
  interface; can come later on top of A.

## Left to the builder

- Where exactly the reminder sits in the Setup and its layout (a slim bar above the range
  cards is the expected default), and how "modified" is shown (same convention as ranges).
- Whether clicking the reminder offers "Reload spot" / "Clear spot".
- What "Save current" offers in the Spots tab (saving the current ranges + numbers as a spot,
  with an empty or typed line) — at least import must work; saving the current setup as a
  spot is welcome if cheap.
- Names of the new store fields and modules.
