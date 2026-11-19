<template>
  <div
    v-if="!store.isSolverFinished"
    class="flex flex-col items-center justify-center h-full gap-2 text-center"
  >
    <template v-if="store.isSolverRunning || store.isFinalizing">
      <span class="spinner inline-block"></span>
      <p class="text-muted">
        {{ store.isSolverRunning ? "Solving…" : "Finalizing…" }} The results
        open when the solve ends.
      </p>
    </template>
    <template v-else-if="store.isSolverPaused">
      <p class="text-lg font-semibold">Solve paused</p>
      <p class="text-muted">Resume or stop it from the top bar.</p>
    </template>
    <template v-else-if="store.isSolverError">
      <p class="text-lg font-semibold">The solve failed</p>
      <p class="text-muted">See the message under the top bar.</p>
    </template>
    <template v-else>
      <p class="text-lg font-semibold">No solution yet</p>
      <p class="text-muted">
        Set up a spot and press Solve in the Setup, or open one from the
        Library.
      </p>
    </template>
  </div>

  <div
    v-else
    :class="[
      'flex flex-col h-full',
      lockResolve.isBusy ? 'pointer-events-none opacity-60' : '',
    ]"
    :inert="lockResolve.isBusy"
  >
    <ResultNav
      :is-handler-updated="isHandlerUpdated"
      :is-locked="isLocked"
      :cards="cards"
      :dealt-card="dealtCard"
      :resolve-request="resolveRequest"
      @update:is-handler-updated="(value) => (isHandlerUpdated = value)"
      @update:is-locked="(value) => (isLocked = value)"
      @trigger-update="onUpdateSpot"
    />

    <RiverPicker
      v-if="
        selectedSpot?.type === 'chance' &&
        selectedSpot.isBeyondDepth &&
        selectedSpot.cards.some((c) => !c.isDead)
      "
      :spot="selectedSpot"
      @pick="pickRiver"
    />

    <ResultsToolbar
      :display-mode="displayMode"
      :chance-mode="chanceMode"
      :auto-player-basics="autoPlayerBasics"
      :auto-player-chance="autoPlayerChance"
      @update:display-mode="updateDisplayMode"
      @update:display-options="updateDisplayOptions"
    >
      <template #actions>
        <UiTooltip
          :text="
            unlockableReason || 'Lock the strategy of this node and re-solve'
          "
        >
          <span>
            <UiButton
              size="sm"
              :disabled="
                !selectedSpot ||
                !results ||
                isLockEditorOpen ||
                store.isLibraryBusy ||
                !!unlockableReason
              "
              @click="isLockEditorOpen = true"
            >
              🔒 Lock node
              <span
                v-if="store.locks.length > 0"
                class="ml-1 px-1.5 rounded-full bg-accent/20 text-accent-ink text-[11px]"
              >
                {{ store.locks.length }}
              </span>
            </UiButton>
          </span>
        </UiTooltip>
      </template>
    </ResultsToolbar>

    <NodeLockEditor
      v-if="isLockEditorOpen && selectedSpot && results"
      :key="line.history.join(',') + '/' + selectedSpot.index"
      :spot="selectedSpot.type === 'player' ? selectedSpot : null"
      :unlockable-reason="unlockableReason"
      :line="line"
      :results="results"
      :cards="cards"
      @close="isLockEditorOpen = false"
    />

    <div
      v-else-if="store.navView === 'results' && selectedSpot && results"
      class="flex flex-grow min-h-0 [container-type:size]"
    >
      <template v-if="displayMode === 'basics'">
        <!-- Square grid; the width left over goes to the summary (at least 380 px). -->
        <ResultBasics
          class="shrink-0"
          :style="{ width: BASICS_SIDE, height: BASICS_SIDE }"
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :current-board="currentBoard"
          :total-bet-amount="totalBetAmount"
          :results="results"
          :display-options="displayOptions"
          :display-player="displayPlayerBasics"
          :is-compare-mode="false"
          @update-hover-content="onUpdateHoverContent"
        />

        <ResultTable
          class="flex-1 min-w-[480px]"
          table-mode="basics"
          :cards="cards"
          :selected-spot="selectedSpot"
          :results="results"
          :display-player="displayPlayerBasics"
          :hover-content="basicsHoverContent"
        >
          <template #top>
            <NodeStrategyCards
              :items="strategyItems"
              :no-hands="noHandsAtNode"
            />
          </template>
        </ResultTable>
      </template>

      <template v-else-if="displayMode === 'graphs'">
        <!-- The chart takes the grid's width in Strategy: the summary does not move. -->
        <ResultGraphs
          :left-width="BASICS_SIDE"
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :results="results"
          :chance-reports="chanceReports"
          :display-options="displayOptions"
          :display-player="displayPlayerBasics"
        >
          <template #table-top>
            <NodeStrategyCards
              :items="strategyItems"
              :no-hands="noHandsAtNode"
            />
          </template>
        </ResultGraphs>
      </template>

      <template v-else-if="displayMode === 'compare'">
        <!-- OOP grid | statistics | IP grid, each grid square in its half. -->
        <div
          v-for="player in COMPARE_PLAYERS.slice(0, 1)"
          :key="player"
          class="flex shrink-0 items-start"
        >
          <!-- A line in the player's colour on top: the middle column names OOP and IP. -->
          <ResultBasics
            :class="[
              'border-t-2',
              player === 'oop' ? 'border-oop' : 'border-ip',
            ]"
            :style="{ width: COMPARE_SIDE, height: COMPARE_SIDE }"
            :cards="cards"
            :selected-spot="selectedSpot"
            :selected-chance="selectedChance"
            :current-board="currentBoard"
            :total-bet-amount="totalBetAmount"
            :results="results"
            :display-options="displayOptions"
            :display-player="player"
            :is-compare-mode="true"
          />
        </div>

        <!-- The grids keep the edges; this column takes the width left (its content stays
             readable). No action cards: the strategy is in the navigation spot, a thin bar
             recalls it. -->
        <div class="flex flex-col flex-1 min-w-[240px] items-center">
          <div class="flex flex-col flex-1 min-h-0 w-full max-w-[22rem]">
            <div
              v-if="strategyItems"
              class="flex shrink-0 h-1.5 mx-3 mt-3 mb-5 rounded-full overflow-hidden"
              :title="strategyTitle"
              role="img"
              :aria-label="strategyTitle"
            >
              <div
                v-for="item in strategyItems"
                :key="item.name + item.amount"
                :style="{
                  width: `${item.frequency * 100}%`,
                  backgroundColor: item.color,
                }"
              />
            </div>
            <p v-else-if="noHandsAtNode" class="px-3 pt-3 text-xs text-muted">
              No hands for this player at this node.
            </p>
            <ResultCompare
              class="flex-1 min-h-0"
              :selected-spot="selectedSpot"
              :selected-chance="selectedChance"
              :results="results"
            />
          </div>
        </div>

        <div
          v-for="player in COMPARE_PLAYERS.slice(1)"
          :key="player"
          class="flex shrink-0 items-start"
        >
          <!-- A line in the player's colour on top: the middle column names OOP and IP. -->
          <ResultBasics
            :class="[
              'border-t-2',
              player === 'oop' ? 'border-oop' : 'border-ip',
            ]"
            :style="{ width: COMPARE_SIDE, height: COMPARE_SIDE }"
            :cards="cards"
            :selected-spot="selectedSpot"
            :selected-chance="selectedChance"
            :current-board="currentBoard"
            :total-bet-amount="totalBetAmount"
            :results="results"
            :display-options="displayOptions"
            :display-player="player"
            :is-compare-mode="true"
          />
        </div>
      </template>

      <template v-else-if="displayMode === 'breakdown'">
        <!-- Square grid (filtered), then the strategy cards and the category table. -->
        <ResultBasics
          class="shrink-0"
          :style="{ width: BASICS_SIDE, height: BASICS_SIDE }"
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :current-board="currentBoard"
          :total-bet-amount="totalBetAmount"
          :results="shownResults!"
          :display-options="displayOptions"
          :display-player="displayPlayerBasics"
          :is-compare-mode="false"
        />
        <div
          class="flex flex-col flex-1 min-w-[480px] bg-panel border-l border-line"
        >
          <NodeStrategyCards :items="strategyItems" :no-hands="noHandsAtNode" />
          <BreakdownTable
            class="flex-1 min-h-0"
            :rows="breakdownTableRows"
            :actions="breakdownActions"
            :filter="breakdownFilter"
            :advanced="breakdownAdvanced"
            @toggle="toggleBreakdownRow"
            @clear="breakdownFilter = {}"
            @update:advanced="setBreakdownAdvanced"
          />
        </div>
      </template>

      <template v-else-if="displayMode === 'chance' && selectedChance">
        <ResultChance
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :chance-reports="chanceReports"
          :display-options="displayOptions"
          :display-player="displayPlayerChance"
          @deal-card="onDealCard"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { actionText } from "../nav-spots";
import { computed, ref, watch } from "vue";
import { useStore } from "../store";
import * as invokes from "../invokes";

import {
  Results,
  ChanceReports,
  Spot,
  SpotChance,
  SpotPlayer,
  DisplayMode,
  DisplayOptions,
  defaultDisplayOptions,
  HoverContent,
} from "../result-types";

import ResultNav from "./ResultNav.vue";
import RiverPicker from "./RiverPicker.vue";
import ResultsToolbar from "./results/ResultsToolbar.vue";
import NodeStrategyCards from "./results/NodeStrategyCards.vue";
import BreakdownTable from "./results/BreakdownTable.vue";
import {
  BreakdownFilter,
  BreakdownGroup,
  breakdownRows,
  comboMask,
  filterResults,
  isFilterActive,
  withoutEquityFilter,
} from "../breakdown";
import UiButton from "./ui/UiButton.vue";
import UiTooltip from "./ui/UiTooltip.vue";
import { nodeStrategy } from "../node-strategy";
import { toFixed1 } from "../utils";
import { useLockResolve } from "../lock-resolve";
import ResultBasics from "./ResultBasics.vue";
import ResultTable from "./ResultTable.vue";
import ResultCompare from "./ResultCompare.vue";
import ResultGraphs from "./ResultGraphs.vue";
import ResultChance from "./ResultChance.vue";
import NodeLockEditor from "./NodeLockEditor.vue";

const store = useStore();
const lockResolve = useLockResolve();

/* Navigation */

const isHandlerUpdated = ref(false);
const isLocked = ref(false);

const cards = ref<number[][]>([[], []]);
const dealtCard = ref(-1);
// Asks ResultNav to re-solve and deal a river past the saved depth.
const resolveRequest = ref<{ card: number; id: number } | null>(null);
let resolveRequestId = 0;
const pickRiver = (card: number) => {
  resolveRequest.value = { card, id: ++resolveRequestId };
};

const selectedSpot = ref<Spot | null>(null);
const selectedChance = ref<SpotChance | null>(null);
const currentBoard = ref<number[]>([]);
const results = ref<Results | null>(null);
const chanceReports = ref<ChanceReports | null>(null);
const totalBetAmount = ref([0, 0]);
const line = ref<{ history: number[]; label: string }>({
  history: [],
  label: "",
});

/* Node lock */

/**
 * Side of the square grid in Strategy, Equity and Breakdown: as tall as the area, but the
 * summary keeps at least half the width (and 480 px), so a tall window does not give a
 * huge grid and a cut table.
 */
const BASICS_SIDE = "min(100cqh, 100cqw - max(480px, 50cqw))";
/** Side of each square grid in Compare mode (statistics 240 px between them). */
const COMPARE_SIDE = "min(100cqh, (100cqw - 240px) / 2)";
const COMPARE_PLAYERS = ["oop", "ip"] as const;

/* Breakdown */

const breakdownFilter = ref<BreakdownFilter>({});
const breakdownAdvanced = ref(false);
const displayedPlayerIndex = computed(() =>
  displayPlayerBasics.value === "oop" ? 0 : 1
);

/** The results, with the displayed player's combos outside the breakdown filter removed. */
const shownResults = computed(() => {
  const r = results.value;
  if (
    !r ||
    displayMode.value !== "breakdown" ||
    !isFilterActive(breakdownFilter.value)
  ) {
    return r;
  }
  const player = displayedPlayerIndex.value;
  const mask = comboMask(
    cards.value[player],
    currentBoard.value,
    r.equity[player],
    breakdownFilter.value
  );
  return filterResults(r, player as 0 | 1, mask);
});

/** The displayed player is the one acting at the selected node. */
const isDisplayedPlayerActing = computed(() => {
  const spot = selectedSpot.value;
  return (
    !!spot &&
    spot.type === "player" &&
    !selectedChance.value &&
    spot.player === displayPlayerBasics.value
  );
});

const breakdownTableRows = computed(() => {
  const r = results.value;
  if (!r || displayMode.value !== "breakdown") return [];
  const player = displayedPlayerIndex.value as 0 | 1;
  if (r.isEmpty & (1 << player)) return [];
  return breakdownRows(
    r,
    cards.value[player],
    currentBoard.value,
    player,
    isDisplayedPlayerActing.value
  );
});

const breakdownActions = computed(() =>
  isDisplayedPlayerActing.value
    ? (selectedSpot.value as SpotPlayer).actions
    : null
);

/** Switching Simple / Advanced drops the equity selections of the hidden view. */
const setBreakdownAdvanced = (value: boolean) => {
  breakdownAdvanced.value = value;
  breakdownFilter.value = withoutEquityFilter(breakdownFilter.value);
};

const toggleBreakdownRow = (group: BreakdownGroup, name: string) => {
  const names = breakdownFilter.value[group] ?? [];
  breakdownFilter.value = {
    ...breakdownFilter.value,
    [group]: names.includes(name)
      ? names.filter((n) => n !== name)
      : [...names, name],
  };
};

const isLockEditorOpen = ref(false);

/** Overall strategy of the acting player at the selected node (null at a card or without hands). */
const strategyItems = computed(() => {
  const spot = selectedSpot.value;
  if (
    !spot ||
    spot.type !== "player" ||
    selectedChance.value ||
    !shownResults.value
  ) {
    return null;
  }
  const player = spot.player === "oop" ? 0 : 1;
  if (shownResults.value.isEmpty & (1 << player)) return null;
  return nodeStrategy(
    shownResults.value.strategy,
    shownResults.value.normalizer[player],
    spot.actions,
    shownResults.value.weights[player]
  );
});

/** The strategy as text, for the thin bar of Compare: "Check 0.2%, Bet 30 · 50% 99.8%". */
const strategyTitle = computed(() =>
  (strategyItems.value ?? [])
    .map((item) => `${actionText(item)} ${toFixed1(item.frequency * 100)}%`)
    .join(", ")
);

/** The acting player has no hand left at the selected node. */
const noHandsAtNode = computed(() => {
  const spot = selectedSpot.value;
  if (
    !spot ||
    spot.type !== "player" ||
    selectedChance.value ||
    !shownResults.value
  ) {
    return false;
  }
  return Boolean(
    shownResults.value.isEmpty & (1 << (spot.player === "oop" ? 0 : 1))
  );
});

/** Why the displayed node cannot be locked, or "" if it can. */
const unlockableReason = computed(() => {
  const spot = selectedSpot.value;
  if (store.isBunchingEnabled && store.bunchingFlop.length > 0) {
    return "Locks are not available with the bunching effect.";
  }
  if (selectedChance.value || !spot || spot.type !== "player") {
    return "Select a player's decision in the line above to lock it.";
  }
  if (line.value.history.includes(-1)) {
    return "Pick the board cards of this line first.";
  }
  const player = spot.player === "oop" ? 0 : 1;
  if (!results.value || results.value.isEmpty & (1 << player)) {
    return "This player has no hand at this node.";
  }
  return "";
});

const isSolverFinished = ref(false);
store.$subscribe(async (_, store) => {
  if (isSolverFinished.value !== store.isSolverFinished) {
    if ((isSolverFinished.value = store.isSolverFinished)) {
      await init();
    } else {
      clear();
    }
  }
});

const init = async () => {
  cards.value = await invokes.gamePrivateCards();
  isHandlerUpdated.value = true;
};

const clear = () => {
  isLockEditorOpen.value = false;
  store.currentLine = null;
  cards.value = [[], []];
  selectedSpot.value = null;
  selectedChance.value = null;
  results.value = null;
  chanceReports.value = null;
};

const onUpdateSpot = (
  newSelectedSpot: Spot | null,
  newSelectedChance: SpotChance | null,
  newCurrentBoard: number[],
  newResults: Results,
  newChanceReports: ChanceReports | null,
  newTotalBetAmount: number[],
  newLine: { history: number[]; label: string }
) => {
  line.value = newLine;
  store.currentLine = newLine;
  dealtCard.value = -1;
  selectedSpot.value = newSelectedSpot;
  selectedChance.value = newSelectedChance;
  currentBoard.value = newCurrentBoard;
  results.value = newResults;
  chanceReports.value = newChanceReports;
  totalBetAmount.value = newTotalBetAmount;
  isLocked.value = false;

  chanceMode.value = newSelectedChance?.player ?? "";
};

/* Middle Bar */

const displayMode = ref<DisplayMode>("basics");
const chanceMode = ref("");

const displayOptions = ref<DisplayOptions>(defaultDisplayOptions());

const updateDisplayMode = (mode: DisplayMode) => {
  displayMode.value = mode;
};

const updateDisplayOptions = (options: DisplayOptions) => {
  displayOptions.value = options;
};

/* Computed */

const autoPlayerBasics = computed(() => {
  const spot = selectedSpot.value;
  const chance = selectedChance.value;
  if (!spot) return "oop";

  if (chance) {
    return chance.prevPlayer;
  } else if (spot.type === "terminal") {
    return spot.prevPlayer;
  } else {
    return (spot as SpotPlayer).player;
  }
});

const autoPlayerChance = computed(() => {
  const spot = selectedSpot.value;
  if (!spot) return "oop";
  if (spot.type === "terminal") {
    return spot.prevPlayer;
  } else {
    return (spot as SpotPlayer).player;
  }
});

const displayPlayerBasics = computed(() => {
  const optionPlayer = displayOptions.value.playerBasics;
  if (optionPlayer === "auto") {
    return autoPlayerBasics.value;
  } else {
    return optionPlayer;
  }
});

const displayPlayerChance = computed(() => {
  const optionPlayer = displayOptions.value.playerChance;
  if (optionPlayer === "auto") {
    return autoPlayerChance.value;
  } else {
    return optionPlayer;
  }
});

/* Results */

const basicsHoverContent = ref<HoverContent | null>(null);

const onUpdateHoverContent = (content: HoverContent | null) => {
  basicsHoverContent.value = content;
};

const onDealCard = (card: number) => {
  dealtCard.value = card;
};

// A breakdown filter only makes sense for the hands it was chosen on.
watch(
  [selectedSpot, selectedChance, displayPlayerBasics, currentBoard],
  () => (breakdownFilter.value = {})
);
</script>
