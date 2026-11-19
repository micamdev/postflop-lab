# Flop report and batch solving: design

Issue #19. The user delegated the decisions ("fais pour le mieux"); calls made here are marked
as such.

## Intent

The goal is to study how to play the flop (above all the c-bet) by texture: compare, flop by
flop, the frequency of each action, the advantages of each range and the averages over a
representative set of flops. This is the equivalent of GTO Wizard's aggregated reports and
PioSolver's aggregation reports, with one gain: it works on the user's own spots (their ranges,
bet sizes and node locks), which GTO Wizard does not offer.

A report is only useful over many flops that represent all of them. Solving flops one by one by
hand cannot get there, so the report comes with **batch solving** of a flop subset. Other
solvers also pair the two: Pio users run batch solves overnight.

## Goals

1. **Richer save summary.** Each save records what a report needs, so a report never loads a
   solution:
   - the strategy of the first player at the root (this already exists);
   - the strategy of IP after OOP checks;
   - each player's equity tranches at the root.
2. **Report.** In the Library, a **Report** action on a solution opens the table of all
   solutions with the same configuration (only the flop differs):
   - one row per flop, plus an **Average** row weighted by how often each flop occurs;
   - sortable columns, texture filters and CSV export;
   - a click on a row opens that solution.
3. **Batch solving.** From the current Setup, solve the same spot over a flop subset and save
   each solution in the Library:
   - it runs in the background, with progress shown, and can be stopped;
   - restarting it skips the flops already in the Library.

## Non-goals (v1)

- A bar chart per flop (GTO Wizard shows one above its table). It may come later, after the
  table.
- Turn and river reports.
- Node locks applied in a batch: a lock is tied to the tree of one flop. The batch solves
  without locks, and says so.
- The bunching effect in a batch: its data is computed per flop and costs a lot.
- Several batches at once, or a queue of batches.

## Anti-goals

- **Never mixing configurations.** Two solutions are in the same report only if everything but
  the flop is identical.
- **No average that misleads.** Each flop is weighted by how often it occurs. A subset cannot
  over-represent monotone flops, for example.
- **No blocking of the app.** The open solution stays usable during a batch.

## Decisions

### 1. Summary (metadata schema 3)

`SolutionSummary` gains:

- `equity_buckets: [[f64; 4]; 2]`: each player's share in the tranches >= 90%, 75-90%,
  50-75% and < 50% at the root. It is weighted like the average equity and computed like
  `equityBuckets` (Compare tab), so the report shows the same Nut advantage (90%+) and Best
  hands advantage (75%+) as Compare.
- `ip_after_check: Option<{ actions, frequencies }>`: IP's strategy after OOP checks, when the
  root player is OOP and has a Check.

Files saved earlier (schema 2) lack these fields: the report shows "—" in those columns. **My
call:** an **Update** action in the report reloads those files one at a time, in a separate
game, recomputes their summary and rewrites each file at the same depth (the data is
re-encoded, so it costs a load and a save per file). Update runs one file at a time and blocks
the other library operations (save, rename, delete, load) while it runs, so it never rewrites
a file that another operation is changing.

### 2. Configuration of a group (fingerprint)

The fingerprint is computed in the front from the metadata: ranges plus `tree_config` without
the board fields, serialized with sorted keys. Locks are part of it (a locked solution is a
different spot). Precision and depth are not (they do not change the spot).

### 3. Which node is the "c-bet"

The c-bet is chosen in the report: **IP after OOP's check** or **OOP first**. The default
depends on the spot: IP if the root has an OOP check (the most common case, BTN vs BB), else
OOP. The choice is not stored with the solutions.

### 4. Report screen

It opens in place of the Library list, with a "← Library" link (**my call**: no new tab in the
top bar).

```
← Library   Report · same spot as "BTN vs BB AK7" · 49 flops (12 missing data) [Update] [Export CSV]
C-bet by: [IP after check] [OOP first]     Texture: [All] [Paired] [Monotone] [Two-tone] [Rainbow]
                                                    [High] [Middle] [Low] [Connected]
 Flop       Texture        Strategy        Check  B 33  B 75  EQ IP  EV IP  Nut adv.  Best hands
 Average                   ███████░░░░      41%    44%   15%   54%    6.1    IP +4%    IP +9%
 A♠K♦7♣     A high, dry    ██████████░░     22%    61%   17%   58%    7.0    IP +9%    IP +14%
```

- **Columns:**
  - flop;
  - texture;
  - a stacked strategy bar with the action colors;
  - one column per action of the chosen node: its frequency;
  - EQ and EV of the player who c-bets;
  - Nut advantage and Best hands advantage. A cell gives the player with the edge and the gap
    in points, or "None" when the gap is under one point, the same rule as Compare.
- **Different action sets:** if the flops of a group do not all have the same actions (this
  can happen with all-in thresholds), the action columns are the union of their names. A
  missing action counts as 0%.
- **Average row:** each flop is weighted by its occurrence weight. In a batch, that is the
  weight of the subset. For flops solved by hand, it is the number of flops that are the same
  up to the suits (12, 24, 4…). The average covers only the rows shown (texture filter
  applied).
- **Textures** come from a pure function `flopTexture(board)`:
  - suits: monotone, two-tone or rainbow;
  - pairing: unpaired, paired or trips;
  - high card: high (A to J), middle (T to 8) or low (7 to 2);
  - connected: at least 2 cards within 4 ranks of each other, using `straightDraws`-like
    logic. The exact rule is a builder call, covered by tests.

### 5. Flop subsets

A pure module `flop-subsets.ts`:

- It enumerates the 1755 flops that are distinct up to the suits, with their weights; the
  weights sum to 22100.
- `representativeFlops(n)` returns n flops and their weights:
  - each texture class (suits × pairing) gets a number of flops proportional to its total
    weight, at least 1;
  - inside a class, the flops are sorted by ranks and taken at regular quantiles;
  - each flop of the class is assigned to the nearest chosen flop (by rank distance), which
    inherits its weight.

  So the weights always sum to 22100, and every class is represented.
- Offered sizes: 25, 49, 95, 184 and all 1755. **My call:** these are the usual sizes, and the
  default is 49.
- The suits are concrete (for example A♠K♦7♣). Each flop is an actual board, not a pattern.

### 6. Batch solving

It runs in Rust, as one async command `batch_solve`:

- It uses **its own game**, not the main game, so the open solution stays usable.
- Inputs:
  - the Setup (ranges, tree config, solve settings);
  - the list of flops with their weights;
  - the save depth, **flop** by default: small files, and enough for the report. River or turn
    on request;
  - a name prefix.
- For each flop:
  1. Skip it if the Library already has a file with this name and the same fingerprint (this
     is how a stopped batch resumes).
  2. Build the game; check the memory, falling back to 16-bit as in a normal solve; solve up
     to the target exploitability or the maximum iterations; finalize.
  3. Save under "prefix flop", for example "BTN vs BB - As Kd 7c". The metadata records the
     weight of the flop in the subset.
  4. Emit `batch-progress`: flop i/n, iteration, exploitability.
- `batch_cancel` stops it between two iterations. The flop being solved is not saved.
- A batch and the main solver never run at the same time:
  - Solve is disabled during a batch;
  - a batch cannot start while a solve is running;
  - library loads stay possible.
- A failure on one flop (not enough memory) is reported in the progress. The batch goes on with
  the next flop and counts it as failed.

The UI is a **Solve a flop subset…** button in the Setup, next to Solve. It opens a dialog with
these fields:
- subset size;
- texture filter (optional);
- name prefix (default: the Setup name);
- save depth.

A progress bar, with a Stop button, appears in the top bar while the batch runs. At the end, a
link opens the report.

### 7. Weights of hand-solved flops

The metadata gets `flop_weight: Option<f64>`. A batch fills it in. When it is absent (flop
solved by hand), the report uses the flop's suit-isomorphism count.

## Delivery

1. **PR 1, summary schema 3:** schema 3 summary, `flop_weight`, and rewriting the metadata of
   an existing file (for Update).
2. **PR 2, report:** the report (fingerprint, textures, table, Average row, filters, CSV,
   Update).
3. **PR 3, batch solving:** flop subsets and batch solving.

Each PR has tests written to fail first, an independent review, and is merged once CI is green.

## Left to the builder

- The exact layout of the batch dialog.
- The rank distance used for the subsets.
- The exact rule for "connected".
- Column widths.
