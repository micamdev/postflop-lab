<template>
  <div
    ref="navDiv"
    class="flex shrink-0 h-[8.5rem] gap-2 px-3 py-2 overflow-x-auto whitespace-nowrap snug bg-bg border-b border-line"
  >
    <div
      v-for="spot in spots"
      :key="spot.index"
      :class="
        'flex flex-col relative h-full min-w-[7.5rem] px-1.5 py-1 justify-start ' +
        'rounded-lg border bg-panel transition-colors group ' +
        (spot.type === 'chance'
          ? isSelectedChanceSkipped && spot.index > selectedChanceIndex
            ? ''
            : 'hover:border-ip '
          : 'hover:border-accent ') +
        (spot.index === selectedChanceIndex
          ? 'border-ip ring-1 ring-ip cursor-default'
          : spot.index === selectedSpotIndex
            ? 'border-accent ring-1 ring-accent cursor-default'
            : spot.type === 'chance' &&
                isSelectedChanceSkipped &&
                spot.index > selectedChanceIndex
              ? 'border-line cursor-default'
              : 'border-line cursor-pointer')
      "
      @click="selectSpot(spot.index, false)"
    >
      <!-- Root or Chance -->
      <template v-if="spot.type === 'root' || spot.type === 'chance'">
        <div
          :class="
            'px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted ' +
            (spot.index === selectedChanceIndex
              ? ''
              : isSelectedChanceSkipped && spot.index > selectedChanceIndex
                ? 'opacity-70'
                : 'group-hover:opacity-100 opacity-70')
          "
        >
          {{ spot.player.toUpperCase() }}
        </div>
        <div
          class="flex flex-col flex-grow px-3 items-center justify-evenly font-semibold"
        >
          <div class="relative">
            <span
              v-for="card of spotCards(spot)"
              :key="card.rank + card.suit"
              :class="
                'inline-flex items-center justify-center w-6 h-8 mx-px rounded text-sm font-bold ' +
                card.chipClass
              "
            >
              {{ card.rank }}
            </span>
            <div
              v-if="spot.type === 'chance' && spot.isBeyondDepth"
              class="text-xs font-normal text-center text-muted whitespace-normal"
            >
              {{
                spot.cards.some((c) => !c.isDead) ? "Pick a river" : "Not saved"
              }}
            </div>
            <div
              v-if="spot.type === 'chance' && spot.isResolved"
              class="text-xs font-normal text-center text-muted"
              title="Re-solved on demand from the ranges at this node: close to, not exactly, the full solution"
            >
              re-solved ≈
            </div>
            <template
              v-if="
                spot.type === 'chance' &&
                spot.selectedIndex !== -1 &&
                !spot.isResolved
              "
            >
              <button
                :class="
                  'absolute -top-[1.375rem] left-1/2 -ml-3 w-6 h-6 ' +
                  (isCardAvailable(spot, 0, 1)
                    ? 'text-muted hover:text-ink'
                    : 'text-muted/25')
                "
                @click.stop="
                  isCardAvailable(spot, 0, 1) && dealArrow(spot, 0, 1)
                "
              >
                <ChevronUpIcon class="w-full h-full" />
              </button>
              <button
                :class="
                  'absolute -left-[1.375rem] top-1/2 -mt-3 w-6 h-6 ' +
                  (isCardAvailable(spot, 1, 0)
                    ? 'text-muted hover:text-ink'
                    : 'text-muted/25')
                "
                @click.stop="
                  isCardAvailable(spot, 1, 0) && dealArrow(spot, 1, 0)
                "
              >
                <ChevronLeftIcon class="w-full h-full" />
              </button>
              <button
                :class="
                  'absolute -right-[1.375rem] top-1/2 -mt-3 w-6 h-6 ' +
                  (isCardAvailable(spot, -1, 0)
                    ? 'text-muted hover:text-ink'
                    : 'text-muted/25')
                "
                @click.stop="
                  isCardAvailable(spot, -1, 0) && dealArrow(spot, -1, 0)
                "
              >
                <ChevronRightIcon class="w-full h-full" />
              </button>
              <button
                :class="
                  'absolute -bottom-[1.375rem] left-1/2 -ml-3 w-6 h-6 ' +
                  (isCardAvailable(spot, 0, -1)
                    ? 'text-muted hover:text-ink'
                    : 'text-muted/25')
                "
                @click.stop="
                  isCardAvailable(spot, 0, -1) && dealArrow(spot, 0, -1)
                "
              >
                <ChevronDownIcon class="w-full h-full" />
              </button>
            </template>
          </div>
          <div
            :class="
              spot.index === selectedChanceIndex
                ? ''
                : isSelectedChanceSkipped && spot.index > selectedChanceIndex
                  ? 'opacity-70'
                  : 'group-hover:opacity-100 opacity-70'
            "
          >
            <div class="text-xs text-muted tabular-nums">
              Pot {{ spot.pot }} · {{ spot.stack }}
            </div>
          </div>
        </div>

        <button
          v-if="
            spot.index === selectedChanceIndex &&
            spot.selectedIndex !== -1 &&
            !isDealing
          "
          class="absolute top-1 right-1 text-muted hover:text-ink"
          @click="deal(spot.selectedIndex)"
        >
          <XMarkIcon class="w-5 h-5" />
        </button>
      </template>

      <!-- Player -->
      <template v-if="spot.type === 'player'">
        <div
          :class="
            'px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted group-hover:opacity-100 ' +
            (spot.index === selectedSpotIndex ? '' : 'opacity-70')
          "
        >
          {{ spot.player.toUpperCase() }}
        </div>
        <div class="flex-grow overflow-y-auto">
          <button
            v-for="action of spot.actions"
            :key="action.index"
            :class="
              'flex items-center w-full gap-1.5 px-1.5 py-px rounded-md text-sm transition-colors hover:bg-panel2 ' +
              (action.isSelected ? 'bg-panel2 ' : '')
            "
            @click.stop="play(spot.index, action.index)"
          >
            <span
              class="shrink-0 w-2 h-2 rounded-full"
              :style="{ backgroundColor: action.color }"
            ></span>
            <span
              :class="
                'pr-0.5 font-medium group-hover:opacity-100 ' +
                (action.isSelected || spot.index === selectedSpotIndex
                  ? ''
                  : 'opacity-70')
              "
            >
              {{ action.name }}
              {{ action.amount === "0" ? "" : action.amount }}
            </span>
            <span
              v-if="spot.index === selectedSpotIndex && rates != null"
              :class="
                'ml-auto pl-2 text-xs text-muted tabular-nums group-hover:opacity-100 ' +
                (action.isSelected || spot.index === selectedSpotIndex
                  ? ''
                  : 'opacity-70')
              "
            >
              {{ (rates[action.index] * 100).toFixed(1) }}%
            </span>
          </button>
        </div>
      </template>

      <!-- Terminal -->
      <template v-else-if="spot.type === 'terminal'">
        <div
          :class="
            'px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted group-hover:opacity-100 ' +
            (spot.index === selectedSpotIndex ? '' : 'opacity-70')
          "
        >
          {{ spot.player.toUpperCase() }}
        </div>
        <div
          :class="
            'flex flex-col flex-grow items-center justify-evenly text-sm group-hover:opacity-100 ' +
            (spot.index === selectedSpotIndex ? '' : 'opacity-70')
          "
        >
          <div v-if="spot.equityOop === 0 || spot.equityOop === 1" class="px-3">
            {{ ["IP", "OOP"][spot.equityOop] }} Wins
          </div>
          <div v-else-if="spot.equityOop !== -1" class="px-1.5">
            <div class="mb-0.5">Equity</div>
            <div class="flex w-full px-1.5">
              <span>OOP</span>
              <span class="ml-auto pl-2">
                {{ (spot.equityOop * 100).toFixed(1) }}%
              </span>
            </div>
            <div class="flex w-full px-1.5">
              <span>IP</span>
              <span class="ml-auto pl-2">
                {{ ((1 - spot.equityOop) * 100).toFixed(1) }}%
              </span>
            </div>
          </div>
          <div class="px-3">Pot {{ spot.pot }}</div>
        </div>
      </template>
    </div>

    <div
      v-if="resolveStatus"
      class="flex self-center items-center px-3 text-sm whitespace-normal"
    >
      <span class="spinner inline-block mr-2"></span>
      {{ resolveStatus }}
    </div>
    <div
      v-if="navError"
      class="self-center px-3 text-sm text-red-400 whitespace-normal"
    >
      {{ navError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, toRefs, ref, watch } from "vue";
import { listen } from "@tauri-apps/api/event";
import { useSavedConfigStore, useStore } from "../store";
import { cardText, average, suitBgClasses } from "../utils";
import { actionColor } from "../action-colors";
import { nodeStrategy } from "../node-strategy";
import * as invokes from "../invokes";

import {
  Results,
  ChanceReports,
  Spot,
  SpotRoot,
  SpotChance,
  SpotPlayer,
} from "../result-types";

import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@heroicons/vue/20/solid";

/** Colour of action `i` of `actions` ("Name:amount"), bets ranked by amount. */
const colorOf = (actions: string[], i: number, numBetActions: number) => {
  const name = actions[i].split(":")[0];
  const hasAllIn = actions[actions.length - 1].split(":")[0] === "AllIn";
  const numBets = numBetActions - (hasAllIn ? 1 : 0);
  return actionColor(name, i - (actions.length - numBetActions), numBets);
};

const props = defineProps<{
  isHandlerUpdated: boolean;
  isLocked: boolean;
  cards: number[][];
  dealtCard: number;
  resolveRequest: { card: number; id: number } | null;
}>();

const emit = defineEmits<{
  (event: "update:is-handler-updated", value: boolean): void;
  (event: "update:is-locked", value: boolean): void;
  (
    event: "trigger-update",
    selectedSpot: Spot | null,
    selectedChance: SpotChance | null,
    currentBoard: number[],
    results: Results,
    chanceReports: ChanceReports | null,
    totalBetAmount: number[],
    line: { history: number[]; label: string }
  ): void;
}>();

const navDiv = ref<HTMLDivElement | null>(null);

const config = useSavedConfigStore();
const store = useStore();

// Message shown when navigation fails (e.g. past the saved depth of a partial save).
const navError = ref("");
// Progress of a river being re-solved on demand.
const resolveStatus = ref("");
const { isHandlerUpdated, dealtCard, resolveRequest } = toRefs(props);

const spots = ref<Spot[]>([]);
const rates = ref<number[] | null>(null);
const selectedSpotIndex = ref(-1);
const selectedChanceIndex = ref(-1);
const isDealing = ref(false);
const canChanceReports = ref(false);

const selectedSpot = computed(() =>
  selectedSpotIndex.value === -1 ||
  selectedSpotIndex.value >= spots.value.length
    ? null
    : spots.value[selectedSpotIndex.value]
);

const selectedChance = computed(() =>
  selectedChanceIndex.value === -1
    ? null
    : (spots.value[selectedChanceIndex.value] as SpotChance)
);

const isSelectedChanceSkipped = computed(() => {
  return selectedChance.value?.selectedIndex === -1;
});

const currentBoard = computed(() => {
  const board = [...config.board];
  const endIndex = selectedChance.value
    ? selectedChanceIndex.value
    : selectedSpotIndex.value;
  for (let i = 3; i < endIndex; ++i) {
    const spot = spots.value[i];
    if (spot.type === "chance") {
      const card = spot.selectedIndex;
      if (card !== -1) board.push(card);
      else return board;
    }
  }
  return board;
});

let selectedSpotIndexTmp = -1;
let selectedChanceIndexTmp = -1;

let results: Results | null = null;
let chanceReports: ChanceReports | null = null;
let totalBetAmount = [0, 0];
let totalBetAmountAppended = [0, 0];

watch(isHandlerUpdated, async () => {
  if (!isHandlerUpdated.value) return;

  const l = config.board.length;
  const spot: SpotRoot = {
    type: "root",
    index: 0,
    player: l === 3 ? "flop" : l === 4 ? "turn" : "river",
    selectedIndex: -1,
    board: config.board,
    pot: config.startingPot,
    stack: config.effectiveStack,
  };
  spots.value = [spot];

  await selectSpot(1, true);
  const line = store.returnLine;
  store.returnLine = null;
  if (line) await replayLine(line);
  emit("update:is-handler-updated", false);
});

/**
 * Navigates from the root along `history` (action indices and dealt cards, as in
 * `selectedLine`), stopping at the first step that does not apply to the tree.
 */
const replayLine = async (history: number[]) => {
  for (const [k, value] of history.entries()) {
    const spot = spots.value[k + 1];
    if (spot?.type === "player" && spot.actions[value]) {
      await play(k + 1, value);
    } else if (
      spot?.type === "chance" &&
      selectedChance.value === spot &&
      spot.cards[value] &&
      !spot.cards[value].isDead
    ) {
      await deal(value);
    } else {
      return;
    }
  }
};

const selectSpot = async (
  spotIndex: number,
  needSplice: boolean,
  fromDeal = false
) => {
  navError.value = "";
  // Clicking the spot already selected does nothing (and keeps a re-solve running).
  if (!needSplice && !fromDeal && spotIndex === selectedSpotIndex.value) return;
  // Navigating elsewhere abandons a river being re-solved.
  if (resolveStatus.value) {
    resolveId++;
    resolveStatus.value = "";
    store.isLibraryBusy = false;
    await invokes.gameCancelSubgame();
  }
  // Clicking a re-solved river reopens the picker to choose another river.
  const target = spots.value[spotIndex];
  if (
    !props.isLocked &&
    !needSplice &&
    target?.type === "chance" &&
    target.isResolved
  ) {
    reopenRiver(target);
  }
  try {
    await selectSpotUnsafe(spotIndex, needSplice, fromDeal);
  } catch (e) {
    emit("update:is-locked", false);
    navError.value =
      String(e) === "beyond saved depth"
        ? "This solution was not saved that deep."
        : `Error: ${e}`;
  }
};

/** Turns a re-solved river back into a river to pick, dropping the spots after it. */
const reopenRiver = (spot: SpotChance) => {
  if (spot.selectedIndex !== -1) {
    spot.cards[spot.selectedIndex].isSelected = false;
  }
  spot.selectedIndex = -1;
  spot.isResolved = false;
  spot.isBeyondDepth = true;
  spots.value.splice(spot.index + 1);
};

let resolveId = 0;

/** History and readable line of the selected spot (e.g. "OOP Check, IP Bet 30, T♥"). */
const selectedLine = () => {
  const path = spots.value.slice(1, selectedSpotIndex.value);
  const label = path
    .map((spot) => {
      if (spot.type === "chance") {
        if (spot.selectedIndex === -1) return "?";
        const card = cardText(spot.selectedIndex);
        return card.rank + card.suit;
      }
      if (spot.type !== "player") return "";
      const action = spot.actions[spot.selectedIndex];
      const amount = action?.amount === "0" ? "" : ` ${action?.amount}`;
      return `${spot.player.toUpperCase()} ${action?.name ?? "?"}${amount}`;
    })
    .join(", ");
  return {
    history: path.map((spot) => spot.selectedIndex),
    label: label || "Root",
  };
};

/**
 * Re-solves the river `card` at the selected "Pick a river" spot (past the saved depth), then
 * deals it like a saved river. A newer pick supersedes (and cancels) this one.
 */
const resolveAndDeal = async (card: number) => {
  const spot = spots.value[selectedSpotIndex.value];
  if (
    !spot ||
    spot.type !== "chance" ||
    !spot.isBeyondDepth ||
    spot.cards[card].isDead
  ) {
    return;
  }
  const id = ++resolveId;
  const history = spots.value.slice(1, spot.index).map((s) => s.selectedIndex);
  const label = cardText(card).rank + cardText(card).suit;
  navError.value = "";
  resolveStatus.value = `Re-solving the river ${label}...`;
  store.isLibraryBusy = true;

  const unlisten = await listen<{ iteration: number }>(
    "subgame-progress",
    (event) => {
      if (id === resolveId) {
        resolveStatus.value = `Re-solving the river ${label}: iteration ${event.payload.iteration}`;
      }
    }
  );
  // Navigating away while the listener was set up cancelled this re-solve already.
  if (id !== resolveId) {
    unlisten();
    return;
  }
  let kind: string;
  try {
    kind = await invokes.gameResolveSubgame(
      history,
      card,
      store.solutionInfo?.exploitability ?? null
    );
  } catch (e) {
    if (id === resolveId) {
      resolveStatus.value = "";
      store.isLibraryBusy = false;
      if (String(e) !== "cancelled") navError.value = `Error: ${e}`;
    }
    return;
  } finally {
    unlisten();
  }
  if (id !== resolveId) return;
  resolveStatus.value = "";
  store.isLibraryBusy = false;

  if (kind === "empty") {
    navError.value = "Nothing to show: a player has no range on this river.";
    return;
  }

  spot.isBeyondDepth = false;
  spot.isResolved = true;
  spot.selectedIndex = card;
  spot.cards[card].isSelected = true;
  // Move to the river chance node first: in chance mode the current position is elsewhere.
  await invokes.gameApplyHistory(history);
  const nextActions = await invokes.gameActionsAfter([card]);
  spliceSpotsPlayer(spot.index + 1, nextActions);
  await selectSpot(spot.index + 1, false);
};

watch(resolveRequest, async (request) => {
  if (request) await resolveAndDeal(request.card);
});

const selectSpotUnsafe = async (
  spotIndex: number,
  needSplice: boolean,
  fromDeal = false
) => {
  if (
    props.isLocked ||
    (!needSplice &&
      ((spotIndex === selectedSpotIndex.value && !fromDeal) ||
        spotIndex === selectedChanceIndex.value ||
        (spots.value[spotIndex].type === "chance" &&
          isSelectedChanceSkipped.value &&
          spotIndex > selectedChanceIndex.value)))
  ) {
    return;
  }

  if (spotIndex === 0) {
    await selectSpot(1, true);
    return;
  }

  // start processing
  emit("update:is-locked", true);

  // avoid unnecessary update of refs
  selectedSpotIndexTmp = selectedSpotIndex.value;
  selectedChanceIndexTmp = selectedChanceIndex.value;

  // when from deal, update river dead cards and terminal equity
  if (fromDeal) {
    const findRiverIndex = spots.value
      .slice(selectedChanceIndexTmp + 3)
      .findIndex((spot) => spot.type === "chance");
    let riverIndex = -1;
    if (findRiverIndex !== -1) {
      riverIndex = findRiverIndex + selectedChanceIndexTmp + 3;
    }
    const riverSpot =
      riverIndex === -1 ? null : (spots.value[riverIndex] as SpotChance);
    selectedChanceIndexTmp = -1;

    // A re-solved river belonged to the previous turn card: offer the pick again.
    if (riverSpot?.isResolved) {
      reopenRiver(riverSpot);
      // The spots after the river are gone: stay on the river spot (position only).
      if (selectedSpotIndexTmp > riverSpot.index) {
        selectedSpotIndexTmp = riverSpot.index;
      }
      if (spotIndex > riverSpot.index) {
        spotIndex = riverSpot.index;
      }
    }
    // Rivers past the depth of a flop save stay without cards; the others are refreshed
    // (for a turn save, the rivers that can be re-solved with the new turn card).
    if (
      riverSpot &&
      !(riverSpot.isBeyondDepth && store.solutionDepth !== "turn")
    ) {
      const history = spots.value
        .slice(1, riverIndex)
        .map((spot) => spot.selectedIndex);
      await invokes.gameApplyHistory(history);
      const possibleCards = await invokes.gamePossibleCards();
      for (let i = 0; i < 52; ++i) {
        const isDead = !(possibleCards & (1n << BigInt(i)));
        riverSpot.cards[i].isDead = isDead;
        if (riverSpot.selectedIndex === i && isDead) {
          riverSpot.cards[i].isSelected = false;
          riverSpot.selectedIndex = -1;
        }
      }
    }

    const riverSkipped = riverSpot?.selectedIndex === -1;
    const lastSpot = spots.value[spots.value.length - 1];

    if (
      !riverSkipped &&
      lastSpot.type === "terminal" &&
      lastSpot.equityOop !== 0 &&
      lastSpot.equityOop !== 1
    ) {
      const history = spots.value
        .slice(1, -1)
        .map((spot) => spot.selectedIndex);
      await invokes.gameApplyHistory(history);
      const results = await invokes.gameGetResults();
      if (!results.isEmpty) {
        lastSpot.equityOop = average(results.equity[0], results.normalizer[0]);
      } else {
        lastSpot.equityOop = -1;
      }
    }
  }

  // update indices of selected spot and selected chance
  const targetSpot = spots.value[spotIndex];
  if (
    !needSplice &&
    targetSpot.type === "chance" &&
    // A "Not saved" spot is shown like a player spot: its position only.
    !targetSpot.isBeyondDepth
  ) {
    selectedChanceIndexTmp = spotIndex;
    if (selectedSpotIndexTmp < spotIndex + 1) {
      selectedSpotIndexTmp = spotIndex + 1;
    }
  } else {
    selectedSpotIndexTmp = spotIndex;
    if (spotIndex <= selectedChanceIndexTmp) {
      selectedChanceIndexTmp = -1;
    } else if (selectedChanceIndexTmp === -1) {
      selectedChanceIndexTmp = spots.value
        .slice(0, spotIndex)
        .findIndex(
          (spot) =>
            spot.type === "chance" &&
            spot.selectedIndex === -1 &&
            !spot.isBeyondDepth
        );
    }
  }

  let endIndex: number;
  if (selectedChanceIndexTmp === -1) {
    endIndex = selectedSpotIndexTmp;
  } else {
    endIndex = selectedChanceIndexTmp;
  }

  const history = spots.value
    .slice(1, endIndex)
    .map((spot) => spot.selectedIndex);

  // apply history
  await invokes.gameApplyHistory(history);

  // obtain results
  results = await invokes.gameGetResults();

  let append: number[] = [];
  if (selectedChanceIndexTmp !== -1) {
    append = spots.value
      .slice(selectedChanceIndexTmp, selectedSpotIndexTmp)
      .map((spot) => spot.selectedIndex);
  }

  // obtain actions after skipped chances
  const nextActions = await invokes.gameActionsAfter(append);

  canChanceReports.value =
    selectedChanceIndexTmp !== -1 &&
    spots.value
      .slice(selectedChanceIndexTmp + 3, selectedSpotIndexTmp)
      .every((spot) => spot.type !== "chance") &&
    nextActions[0] !== "chance";

  // if possible, obtain chance reports
  if (canChanceReports.value) {
    let player: "oop" | "ip" | "terminal";
    let numActions: number;

    if (nextActions[0] === "terminal") {
      player = "terminal";
      numActions = 0;
    } else {
      player = append.length % 2 === 1 ? "oop" : "ip";
      numActions = nextActions.length;
    }

    chanceReports = await invokes.gameGetChanceReports(
      append,
      player,
      numActions
    );
  } else {
    chanceReports = null;
  }

  // update total bet amounts
  totalBetAmount = await invokes.gameTotalBetAmount([]);
  totalBetAmountAppended = await invokes.gameTotalBetAmount(append);

  // if need to splice, splice spots
  if (needSplice) {
    if (nextActions[0] === "terminal") {
      spliceSpotsTerminal(spotIndex);
    } else if (nextActions[0] === "chance") {
      await spliceSpotsChance(spotIndex);
    } else {
      spliceSpotsPlayer(spotIndex, nextActions);
    }
  }

  // update action rates if necessary
  const spot = spots.value[selectedSpotIndexTmp];
  if (spot.type === "player" && selectedChanceIndexTmp === -1) {
    const playerIndex = spot.player === "oop" ? 0 : 1;
    if (results.isEmpty & (1 << playerIndex)) {
      rates.value = null;
    } else {
      rates.value =
        nodeStrategy(
          results.strategy,
          results.normalizer[playerIndex],
          spot.actions,
          results.weights[playerIndex]
        )?.map((item) => item.frequency) ?? null;
    }
  } else {
    rates.value = null;
  }

  // update refs
  selectedSpotIndex.value = selectedSpotIndexTmp;
  selectedChanceIndex.value = selectedChanceIndexTmp;
  isDealing.value = false;

  // emit event
  emit(
    "trigger-update",
    selectedSpot.value,
    selectedChance.value,
    currentBoard.value,
    results,
    chanceReports,
    totalBetAmount,
    selectedLine()
  );

  // scroll to selected spot
  await nextTick();
  if (navDiv.value) {
    const selectedChild = navDiv.value.children[selectedSpotIndex.value];
    if (selectedChild) {
      selectedChild.scrollIntoView({
        behavior: "smooth",
        inline: "center",
      });
    }
  }
};

const spliceSpotsTerminal = (spotIndex: number) => {
  if (!results) throw new Error("null results");

  const prevSpot = spots.value[spotIndex - 1] as SpotPlayer;
  const prevAction = prevSpot.actions[prevSpot.selectedIndex];

  const chanceIndex = selectedChanceIndexTmp;
  const chanceSkipped =
    chanceIndex !== -1 &&
    (spots.value[chanceIndex] as SpotChance).selectedIndex === -1;

  let equityOop;
  if (prevAction.name === "Fold") {
    equityOop = prevSpot.player === "oop" ? 0 : 1;
  } else if (chanceSkipped || results.isEmpty) {
    equityOop = -1;
  } else {
    equityOop = average(results.equity[0], results.normalizer[0]);
  }

  const betSum = totalBetAmountAppended[0] + totalBetAmountAppended[1];
  spots.value.splice(spotIndex, spots.value.length, {
    type: "terminal",
    index: spotIndex,
    player: "end",
    selectedIndex: -1,
    prevPlayer: prevSpot.player,
    equityOop,
    pot: config.startingPot + betSum,
  });
};

const spliceSpotsChance = async (spotIndex: number) => {
  type SpotTurn = SpotRoot | SpotChance;
  const prevSpot = spots.value[spotIndex - 1] as SpotPlayer;
  const turnSpot = spots.value
    .slice(0, spotIndex)
    .find((spot) => spot.player === "turn") as SpotTurn | undefined;

  // A partial save cannot deal this card: show the chance node without cards and stop there.
  // Its position (ranges, equity, EV before the card) stays viewable.
  const dealing = turnSpot ? "river" : "turn";
  if (
    store.solutionDepth === "flop" ||
    (store.solutionDepth === "turn" && dealing === "river")
  ) {
    // Rivers of a turn save can be re-solved on demand: offer the possible ones.
    // The river can be re-solved only if the turn card is known (not skipped).
    const riverPrefix = spots.value
      .slice(1, spotIndex)
      .map((spot) => spot.selectedIndex);
    const resolvable =
      store.solutionDepth === "turn" &&
      dealing === "river" &&
      !riverPrefix.includes(-1);
    let possible = 0n;
    if (resolvable) {
      // Possible rivers at the river chance node, whatever the current position.
      await invokes.gameApplyHistory(riverPrefix);
      possible = await invokes.gamePossibleCards();
    }
    spots.value.splice(spotIndex, spots.value.length, {
      type: "chance",
      index: spotIndex,
      player: dealing,
      selectedIndex: -1,
      prevPlayer: prevSpot.player,
      cards: Array.from({ length: 52 }, (_, i) => ({
        card: i,
        isSelected: false,
        isDead: !(possible & (1n << BigInt(i))),
      })),
      pot: config.startingPot + 2 * totalBetAmountAppended[0],
      stack: config.effectiveStack - totalBetAmountAppended[0],
      isBeyondDepth: true,
    });
    return;
  }

  let append: number[] = [];
  if (selectedChanceIndexTmp !== -1) {
    append = spots.value
      .slice(selectedChanceIndexTmp, spotIndex)
      .map((spot) => spot.selectedIndex);
  }

  let possibleCards = 0n;
  if (!(turnSpot?.type === "chance" && turnSpot.selectedIndex === -1)) {
    possibleCards = await invokes.gamePossibleCards();
  }

  append.push(-1);
  const nextActions = await invokes.gameActionsAfter(append);

  let numBetActions = nextActions.length;
  while (
    numBetActions > 0 &&
    nextActions[nextActions.length - numBetActions].split(":")[1] === "0"
  ) {
    --numBetActions;
  }

  if (selectedChanceIndexTmp === -1) {
    canChanceReports.value = true;
    const numActions = nextActions.length;
    chanceReports = await invokes.gameGetChanceReports(
      append,
      "oop",
      numActions
    );
  }

  spots.value.splice(
    spotIndex,
    spots.value.length,
    {
      type: "chance",
      index: spotIndex,
      player: turnSpot ? "river" : "turn",
      selectedIndex: -1,
      prevPlayer: prevSpot.player,
      cards: Array.from({ length: 52 }, (_, i) => ({
        card: i,
        isSelected: false,
        isDead: !(possibleCards & (1n << BigInt(i))),
      })),
      pot: config.startingPot + 2 * totalBetAmountAppended[0],
      stack: config.effectiveStack - totalBetAmountAppended[0],
    },
    {
      type: "player",
      index: spotIndex + 1,
      player: "oop",
      selectedIndex: -1,
      actions: nextActions.map((action, i) => {
        const [name, amount] = action.split(":");
        return {
          index: i,
          name,
          amount,
          rate: -1,
          isSelected: false,
          color: colorOf(nextActions, i, numBetActions),
        };
      }),
    }
  );

  ++selectedSpotIndexTmp;

  if (selectedChanceIndexTmp === -1) {
    selectedChanceIndexTmp = spotIndex;
  }
};

const spliceSpotsPlayer = (spotIndex: number, actions: string[]) => {
  const prevSpot = spots.value[spotIndex - 1];
  const player = prevSpot.player === "oop" ? "ip" : "oop";

  let numBetActions = actions.length;
  if (actions[0].split(":")[1] === "0") --numBetActions;
  if (actions[1]?.split(":")[1] === "0") --numBetActions;

  spots.value.splice(spotIndex, spots.value.length, {
    type: "player",
    index: spotIndex,
    player,
    selectedIndex: -1,
    actions: actions.map((action, i) => {
      const [name, amount] = action.split(":");
      return {
        index: i,
        name,
        amount,
        isSelected: false,
        color: colorOf(actions, i, numBetActions),
      };
    }),
  });
};

const play = async (spotIndex: number, actionIndex: number) => {
  const spot = spots.value[spotIndex] as SpotPlayer;

  if (spot.selectedIndex !== -1) {
    spot.actions[spot.selectedIndex].isSelected = false;
  }
  spot.actions[actionIndex].isSelected = true;
  spot.selectedIndex = actionIndex;

  await selectSpot(spotIndex + 1, true);
};

const deal = async (card: number) => {
  const spot = selectedChance.value;
  if (!spot) throw new Error("null spot");

  isDealing.value = true;

  if (spot.selectedIndex !== -1) {
    spot.cards[spot.selectedIndex].isSelected = false;
  }
  spot.cards[card].isSelected = true;
  spot.selectedIndex = card;

  await selectSpot(selectedSpotIndex.value, false, true);
};

const dealArrow = async (
  spot: SpotChance,
  rankDir: number,
  suitDir: number
) => {
  const offset = rankDir ? 4 * rankDir : suitDir;
  let card = spot.selectedIndex + offset;

  for (; 0 <= card && card < 52; card += offset) {
    if (!spot.cards[card].isDead) break;
  }

  if (card < 0 || 52 <= card) {
    throw new Error("invalid card");
  }

  isDealing.value = true;

  spot.cards[spot.selectedIndex].isSelected = false;
  spot.cards[card].isSelected = true;
  spot.selectedIndex = card;

  const selectedChanceIndexBak = selectedChanceIndex.value;
  selectedChanceIndex.value = spot.index;

  await selectSpot(selectedSpotIndex.value, false, true);

  if (
    selectedChanceIndex.value === -1 &&
    selectedChanceIndexBak !== spot.index
  ) {
    selectedChanceIndex.value = selectedChanceIndexBak;
  }
};

const isCardAvailable = (
  spot: SpotChance,
  rankDir: number,
  suitDir: number
) => {
  let card = spot.selectedIndex;

  if (rankDir) {
    card += 4 * rankDir;
    for (; 0 <= card && card < 52; card += 4 * rankDir) {
      if (!spot.cards[card].isDead) return true;
    }
  } else {
    const rank = card >>> 2;
    card += suitDir;
    for (; card >>> 2 === rank; card += suitDir) {
      if (!spot.cards[card].isDead) return true;
    }
  }

  return false;
};

watch(dealtCard, async (card) => {
  if (card === -1) return;
  await deal(card);
});

const chip = (card: number) => ({
  rank: cardText(card).rank,
  suit: cardText(card).suit,
  chipClass: "text-white " + suitBgClasses[card & 3],
});

const spotCards = (spot: SpotRoot | SpotChance) => {
  if (spot.type === "root") {
    return spot.board.map(chip);
  } else if (spot.selectedIndex === -1) {
    return [
      {
        rank: "?",
        suit: "",
        chipClass: "border border-dashed border-line text-muted",
      },
    ];
  } else {
    return [chip(spot.selectedIndex)];
  }
};
</script>
