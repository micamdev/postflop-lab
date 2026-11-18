# Breakdown and hand-category filters: design

One branch, `feat/breakdown`, with one PR to `dev`.

## Intent

The user wants to read a node by hand category, as in GTO Wizard's Breakdown tab and Filters:
- what does the player do with their top pairs, sets, gutshots;
- how much of the range each category weighs;
- which equity buckets the range falls into.

Selecting categories filters the grid, so you can see the strategy of just those hands.

- **Goals:**
  - the same category names and groups as GTO Wizard;
  - all UI text in English;
  - no engine change.
- **Non-goals for now:**
  - Exclude filters;
  - kicker distinctions;
  - nut draws;
  - blockers;
  - filters outside the Breakdown tab.
- **Anti-goals:**
  - a wrong category for a common hand (for example top pair shown as second pair);
  - any change to the existing Strategy, Equity and Compare modes;
  - a slow UI on large ranges.

## What the user sees

- **A 4th mode `Breakdown`** in the Results toolbar, after Compare.
  - The player switch (Auto/OOP/IP) is the same as in Strategy.
  - In chance mode the button is disabled, like Compare.
- **Layout:**
  - left: the square grid of the displayed player, as in Strategy;
  - right: the strategy cards (`NodeStrategyCards`), then the breakdown table.
- **Breakdown table**, in three groups separated by a header row:
  - **Hands:** Straight flush, Quads, Fullhouse, Flush, Straight, Set, Trips, Two pair, Overpair, Top pair, Second pair, Third pair, Underpair, Ace high, No made hand.
  - **Draws** (flop and turn only; the group is hidden on the river): Flush draw, OESD, Gutshot, BDFD 2 cards, BDFD 1 card, BDSD, No draw. BDFD and BDSD exist only on the flop.
  - **Equity buckets**, with a `Simple | Advanced` switch in the group header:
    - Simple: Best hands, Good hands, Weak hands, Trash hands;
    - Advanced: Equity 90-100, 80-90, 70-80, 60-70, 50-60, 25-50, 0-25.
- **Columns:**
  - Category;
  - Strategy (stacked bar of the action frequencies, in the action colours; only when the displayed player is the one acting);
  - Range % (share of the player's combos);
  - Combos;
  - EQ;
  - EV.

  Rows with 0 combos are hidden.
- **Filtering:**
  - A click on a row toggles it as a filter. Inside a group, selected rows combine as a union ("Top pair" + "Set" = either). Across groups they combine as an intersection ("Top pair" + "Flush draw" = top pairs with a flush draw), as in GTO Wizard. *(My call.)*
  - Selected rows are highlighted. A `Clear` button appears in the table header while a filter is active.
  - With a filter, the grid and the strategy cards only count the filtered combos. A cell with no filtered combos shows as empty.
  - The filter resets when the node, the displayed player or the board (turn/river card) changes.
  - The table itself is always computed on the whole range of the displayed player, never on the filtered copy. Range % = category combos / the player's total combos.
  - The Strategy column is hidden (not empty) when the displayed player is not the one acting. Breakdown is available wherever Strategy is (player nodes), and disabled in chance mode.
  - Combos are weighted (range weight × card removal, as in the Summary's Weight column), so they can be fractional. Rows under 0.05 combos are hidden.

## Category rules (exclusive inside each group)

Every combo is classified from its two hole cards and the current board. A made category counts only if a hole card contributes: playing the board gives "No made hand", unless the hand holds an ace (then "Ace high").

**Hands**, the first rule that matches wins:

1. **Straight flush, Quads, Fullhouse, Flush, Straight:** the best 5-card hand is of this class, and it is strictly better than the board's own best hand. The comparison is on whole hand values, so a higher flush on a four- or five-flush board counts as Flush. *(My call.)* For example, a straight board where the hand does not improve gives "No made hand" or "Ace high".
2. **Set:** a pocket pair matching a board rank.
3. **Trips:** one hole card matches a paired board rank.
4. **Two pair:** both hole cards pair two different board ranks. Pairs on the board alone do not count.

   **Paired boards (checked on GTO Wizard, K-K-4 flop):** the board pair is ignored for pair categories, so A4 and the pocket pairs QQ-55 are Second pair, 33-22 are Underpair and AA is Overpair. A hole card matching the paired rank is Trips, and K4 or 44 are Fullhouse (rule 1). Top pair and Two pair only come from unpaired board ranks.
5. **Overpair:** a pocket pair above the highest board rank.
6. **Top / Second / Third pair:**
   - With one hole card pairing a board rank, rank the distinct board ranks from high to low: 1st = Top pair, 2nd = Second pair, 3rd or lower = Third pair.
   - A pocket pair between the 1st and 2nd distinct board rank = Second pair. Between the 2nd and the lowest = Third pair. This is how GTO Wizard groups them.
7. **Underpair:** a pocket pair below the lowest board rank.
8. **Ace high:** no pair from the hole cards, and the hand holds an ace.
9. **No made hand:** everything else.

**Draws** apply only to hands that are not already a flush or better. Straight draws (OESD, Gutshot, BDSD) apply only to hands that are not already a straight. Outs that pair the board still count. The order below makes each combo fall in one draw row (a flush draw + OESD shows as Flush draw), so the group adds up to 100 %, as in GTO Wizard. *(My calls.)* The first rule that matches wins:

1. **Flush draw:** 4 cards of a suit with at least one hole card, before the river.
2. **OESD:** at least 8 straight outs that use a hole card. A double gutshot counts as OESD.
3. **Gutshot:** 4 straight outs that use a hole card.
4. **BDFD 2 cards** (flop): both hole cards of a suit that has exactly 1 board card.
5. **BDFD 1 card** (flop): one hole card of a suit that has exactly 2 board cards.
6. **BDSD** (flop): no straight draw yet, but at least one turn+river pair of ranks makes a straight using at least one hole card. This is my definition; GTO Wizard's is not public.
7. **No draw.**

**Equity buckets**, from the player's equity for the combo (`equity`, not EQR):
- Simple:
  - Best ≥ 75 %;
  - Good 50–75 %;
  - Weak 33–50 %;
  - Trash < 33 %.

  The 50 % boundary is checked against GTO Wizard's own figures. 75 and 33 are my reading of those figures.
- Advanced: the 7 ranges above. A lower bound is included in its range; 100 % falls in 90-100.

## Approaches considered

- **Chosen: a pure TypeScript module plus a filtered `Results`.**
  - `hand-category.ts` classifies a combo from its card ids.
  - `breakdown.ts` aggregates per category: combos, frequencies weighted by the normalizer like the Summary, EQ and EV weighted the same way.
  - The filter builds a copy of `Results` in which the weights and the normalizer of excluded combos are set to 0. The grid, the strategy cards and the table therefore work unchanged.
- **Rejected: classifying in Rust.** It means new Tauri commands and a cross-language round trip, for logic that is pure and cheap (at most 1326 combos).
- **Rejected: filtering inside each component** (grid, cards). It would duplicate the logic and add risk to the existing modes.

## Constraints

- No change to the engine, the Rust commands or the stores. The breakdown state (selected rows, Simple/Advanced) is local to the Results view.
- Classifying at most 1326 combos stays under a few milliseconds per node change, so nothing slows down the UI.
- Strategy, Equity, Compare, lock, chance mode and the hover summary behave exactly as before.
- The column layout follows `ResultTable`, with the Graphite tokens and the UI kit.

## Left to the builder

- The exact visual style of the group headers and the selected rows.
- The internal representation of hands (bit masks, rank counts).
