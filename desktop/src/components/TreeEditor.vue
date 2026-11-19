<template>
  <p v-if="isTreeError" class="text-sm text-red-400">
    The tree could not be built (a broken saved tree?).
  </p>

  <template v-else>
    <!-- Navigation, as in the results: click a spot, then an action. -->
    <div
      ref="navDiv"
      class="flex h-[8.5rem] gap-2 pb-2 overflow-x-auto whitespace-nowrap snug"
    >
      <div
        v-for="spot in spots"
        :key="spot.index"
        :class="[
          'flex flex-col shrink-0 h-full min-w-[7.5rem] px-1.5 py-1 rounded-lg border bg-panel transition-colors group',
          spot.index === selectedSpotIndex
            ? 'border-accent ring-1 ring-accent cursor-default'
            : 'border-line hover:border-accent cursor-pointer',
        ]"
        @click="selectSpot(spot.index, false, false, true)"
      >
        <div
          class="px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted"
        >
          {{ spot.player.toUpperCase() }}
        </div>

        <!-- Root or chance -->
        <div
          v-if="spot.type === 'root' || spot.type === 'chance'"
          class="flex flex-col flex-grow px-2 justify-center text-xs text-muted tabular-nums"
        >
          <div>Pot {{ spot.pot }}</div>
          <div>Stack {{ spot.stack }}</div>
        </div>

        <!-- Player -->
        <div
          v-else-if="spot.type === 'player'"
          class="flex-grow overflow-y-auto"
        >
          <button
            v-for="action of spot.actions"
            :key="action.index"
            :class="[
              'flex items-center w-full gap-1.5 px-1.5 py-px rounded-md text-sm transition-colors hover:bg-panel2',
              action.isSelected ? 'bg-panel2 font-semibold' : '',
            ]"
            @click.stop="play(spot.index, action.index)"
          >
            {{ actionText(action) }}
          </button>
          <div
            v-if="spot.actions.length === 0"
            class="px-1.5 text-xs text-muted"
          >
            No actions
          </div>
        </div>

        <!-- Terminal -->
        <div
          v-else-if="spot.type === 'terminal'"
          class="flex flex-col flex-grow px-2 justify-center text-xs text-muted"
        >
          <div v-if="spot.equityOop === 0 || spot.equityOop === 1">
            {{ ["IP", "OOP"][spot.equityOop] }} wins
          </div>
          <div class="tabular-nums">Pot {{ spot.pot }}</div>
        </div>
      </div>
    </div>

    <ul v-if="invalidLinesArray.length > 0" class="mt-2 text-xs text-red-400">
      <li v-for="invalidLine in invalidLinesArray" :key="invalidLine">
        Invalid terminal: {{ invalidLine }}
      </li>
    </ul>

    <!-- Edit the selected spot -->
    <UiPanel title="Selected spot" class="mt-3 max-w-3xl">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted">Bet</span>
        <input
          v-model="betAmount"
          type="number"
          :class="[
            'ui-input w-24 text-center',
            betAmount < minAmount ||
            betAmount > maxAmount ||
            betAmount % 1 !== 0
              ? '!border-red-500'
              : '',
          ]"
          :min="minAmount"
          :max="maxAmount"
          @keydown.enter="addBetAction"
        />
        <span
          v-if="!isSelectedTerminal && !isAfterAllin"
          class="text-xs text-muted"
        >
          {{ (amountRate * 100).toFixed(1) }}% of the pot
        </span>
        <UiButton
          :disabled="
            isSelectedTerminal ||
            isAfterAllin ||
            betAmount < minAmount ||
            betAmount > maxAmount ||
            betAmount % 1 !== 0 ||
            existingAmounts.includes(betAmount)
          "
          @click="addBetAction"
        >
          Add bet
        </UiButton>
        <div class="flex-1" />
        <UiButton
          variant="danger"
          :disabled="selectedSpotIndex === 1"
          title="Remove the action that leads to the selected spot, and the lines after it"
          @click="removeSelectedNode"
        >
          Remove this line
        </UiButton>
      </div>
    </UiPanel>

    <!-- Lines edited so far -->
    <UiPanel
      v-if="addedLinesArray.length > 0 || removedLinesArray.length > 0"
      title="Lines edited by hand"
      class="mt-3 max-w-3xl"
    >
      <div v-if="addedLinesArray.length > 0" class="text-sm">
        <div class="mb-1 text-xs text-muted">Added</div>
        <div
          v-for="(addedLine, index) in addedLinesArray"
          :key="addedLine"
          class="flex items-center gap-2"
        >
          <button
            type="button"
            class="text-muted hover:text-red-400"
            title="Undo this line"
            @click="deleteLine('added', index)"
          >
            <TrashIcon class="w-4 h-4" />
          </button>
          <span>{{ addedLine }}</span>
        </div>
      </div>
      <div
        v-if="removedLinesArray.length > 0"
        :class="['text-sm', addedLinesArray.length > 0 ? 'mt-3' : '']"
      >
        <div class="mb-1 text-xs text-muted">Removed</div>
        <div
          v-for="(removedLine, index) in removedLinesArray"
          :key="removedLine"
          class="flex items-center gap-2"
        >
          <button
            type="button"
            class="text-muted hover:text-red-400"
            title="Undo this line"
            @click="deleteLine('removed', index)"
          >
            <TrashIcon class="w-4 h-4" />
          </button>
          <span>{{ removedLine }}</span>
        </div>
      </div>
    </UiPanel>
  </template>

  <div class="flex gap-2 mt-4">
    <UiButton
      variant="primary"
      :disabled="isTreeError || invalidLinesArray.length > 0"
      @click="saveEdit"
    >
      Save edits
    </UiButton>
    <UiButton @click="cancelEdit">Cancel</UiButton>
  </div>
</template>

<script setup lang="ts">
import { actionCode, readableLines } from "../tree-lines";
import { actionText, streetBets, toSpotActions } from "../nav-spots";
import UiButton from "./ui/UiButton.vue";
import UiPanel from "./ui/UiPanel.vue";
import { computed, nextTick, ref, watch } from "vue";
import { useConfigStore } from "../store";
import { gameTreeArgs } from "../game-args";
import { Spot, SpotRoot, SpotChance, SpotPlayer } from "../result-types";
import * as invokes from "../invokes";

import { TrashIcon } from "@heroicons/vue/24/outline";

/** What Save would write, and whether it may (no tree error, no invalid line). */
export type TreeEditState = {
  added: string;
  removed: string;
  canSave: boolean;
};

const emit = defineEmits<{
  (event: "save", addedLines: string, removedLines: string): void;
  (event: "cancel"): void;
  (event: "state", state: TreeEditState): void;
}>();

const navDiv = ref(null as HTMLDivElement | null);

const config = useConfigStore();
let isLocked = false;

const boardLength = config.expectedBoardLength;

const isTreeError = !(await invokes.treeNew(gameTreeArgs(config), boardLength));

const rootSpot: SpotRoot = {
  type: "root",
  index: 0,
  player: boardLength === 3 ? "flop" : boardLength === 4 ? "turn" : "river",
  selectedIndex: -1,
  board: config.board,
  pot: config.startingPot,
  stack: config.effectiveStack,
};
const spots = ref<Spot[]>([rootSpot]);
const selectedSpotIndex = ref(-1);

const isSelectedTerminal = computed(() => {
  if (isLocked || selectedSpotIndex.value === -1) return false;
  const selectedSpot = spots.value[selectedSpotIndex.value];
  return selectedSpot.type === "terminal";
});

const betAmount = ref(0);
const totalBetAmount = ref([0, 0]);
const prevBetAmount = ref(0);

const isAfterAllin = computed(() => {
  const maxTotalBetAmount = Math.max(...totalBetAmount.value);
  return maxTotalBetAmount === config.effectiveStack;
});

const maxAmount = computed(() => {
  if (isSelectedTerminal.value) return 0;
  const maxTotalBetAmount = Math.max(...totalBetAmount.value);
  return config.effectiveStack - (maxTotalBetAmount - prevBetAmount.value);
});

const minAmount = computed(() => {
  const betMinus = config.effectiveStack - maxAmount.value;
  const min = Math.min(...totalBetAmount.value) - betMinus;
  const max = Math.max(...totalBetAmount.value) - betMinus;
  return Math.min(Math.max(2 * max - min, 1), maxAmount.value);
});

const amountRate = computed(() => {
  const pot = config.startingPot + 2 * Math.max(...totalBetAmount.value);
  const amount = betAmount.value - prevBetAmount.value;
  return amount / pot;
});

const existingAmounts = computed(() => {
  if (isLocked || selectedSpotIndex.value === -1) return [];
  const ret: number[] = [];
  const spot = spots.value[selectedSpotIndex.value] as SpotPlayer;
  for (const action of spot.actions) {
    if (action.amount !== "0") {
      ret.push(Number(action.amount));
    }
  }
  return ret;
});

const addedLines = ref(await invokes.treeAddedLines());
const removedLines = ref(await invokes.treeRemovedLines());
const invalidLines = ref(await invokes.treeInvalidTerminals());

const addedLinesArray = computed(() => readableLines(addedLines.value));
const removedLinesArray = computed(() => readableLines(removedLines.value));
const invalidLinesArray = computed(() => readableLines(invalidLines.value));

/** Reads the tree's lines again after a change. */
const refreshLines = async () => {
  addedLines.value = await invokes.treeAddedLines();
  removedLines.value = await invokes.treeRemovedLines();
  invalidLines.value = await invokes.treeInvalidTerminals();
};

/** The codes of the actions chosen before `spotIndex` ("X", "B30"…). */
const encodeLine = (spotIndex: number) =>
  spots.value
    .slice(1, spotIndex)
    .flatMap((spot) =>
      spot.type === "player"
        ? [
            actionCode(
              spot.actions[spot.selectedIndex].name,
              spot.actions[spot.selectedIndex].amount
            ),
          ]
        : []
    );

const selectSpot = async (
  spotIndex: number,
  needSplice: boolean,
  needRebuild: boolean,
  needAmountUpdate: boolean
) => {
  if (!needSplice && !needRebuild && spotIndex === selectedSpotIndex.value) {
    return;
  }

  if (spotIndex === 0) {
    await selectSpot(1, true, false, selectedSpotIndex.value !== 1);
    return;
  }

  if (!needSplice && spots.value[spotIndex]?.type === "chance") {
    await selectSpot(spotIndex + 1, false, false, true);
    return;
  }

  isLocked = true;

  if (needRebuild) {
    const selectedSpotIndexTmp = selectedSpotIndex.value;
    const line = encodeLine(spots.value.length - 1);
    spots.value = [rootSpot];

    selectedSpotIndex.value = 1;
    totalBetAmount.value = [0, 0];

    await invokes.treeBackToRoot();
    await pushResultsPlayer();

    for (let i = 0; i < line.length; ++i) {
      const index = await invokes.treePlay(line[i]);
      if (index === -1) {
        needAmountUpdate = true;
        break;
      }

      const spot = spots.value[selectedSpotIndex.value] as SpotPlayer;
      const action = spot.actions[index];
      spot.selectedIndex = index;
      action.isSelected = true;

      ++selectedSpotIndex.value;
      totalBetAmount.value = await invokes.treeTotalBetAmount();

      if (await invokes.treeIsTerminalNode()) {
        pushResultsTerminal();
      } else if (await invokes.treeIsChanceNode()) {
        await pushResultsChance();
        ++selectedSpotIndex.value;
      } else {
        await pushResultsPlayer();
      }
    }

    if (selectedSpotIndexTmp < selectedSpotIndex.value) {
      selectedSpotIndex.value = selectedSpotIndexTmp;
    }
  } else {
    selectedSpotIndex.value = spotIndex;
  }

  const line = encodeLine(selectedSpotIndex.value);
  await invokes.treeApplyHistory(line);
  totalBetAmount.value = await invokes.treeTotalBetAmount();

  if (needSplice) {
    spots.value.splice(selectedSpotIndex.value);
    if (await invokes.treeIsTerminalNode()) {
      pushResultsTerminal();
    } else if (await invokes.treeIsChanceNode()) {
      await pushResultsChance();
      ++selectedSpotIndex.value;
    } else {
      await pushResultsPlayer();
    }
  }

  const prev = spots.value[selectedSpotIndex.value - 1];
  if (prev.type === "player") {
    prevBetAmount.value = Number(prev.actions[prev.selectedIndex].amount);
  } else {
    prevBetAmount.value = 0;
  }

  if (needAmountUpdate) {
    betAmount.value = minAmount.value;
  }

  isLocked = false;
  autoScrollNav();
};

const autoScrollNav = async () => {
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

const pushResultsTerminal = () => {
  const prevSpot = spots.value[selectedSpotIndex.value - 1] as SpotPlayer;
  const prevAction = prevSpot.actions[prevSpot.selectedIndex];

  let equityOop = -1;
  if (prevAction.name === "Fold") {
    equityOop = prevSpot.player === "oop" ? 0 : 1;
  }

  spots.value.push({
    type: "terminal",
    index: selectedSpotIndex.value,
    player: "end",
    selectedIndex: -1,
    prevPlayer: prevSpot.player,
    equityOop,
    pot: config.startingPot + totalBetAmount.value[0] + totalBetAmount.value[1],
  });
};

const pushResultsChance = async () => {
  type SpotTurn = SpotRoot | SpotChance;
  const prevSpot = spots.value[selectedSpotIndex.value - 1] as SpotPlayer;
  const turnSpot = spots.value.find((spot) => spot.player === "turn") as
    SpotTurn | undefined;

  const nextActions = await invokes.treeActions();

  spots.value.push(
    {
      type: "chance",
      index: selectedSpotIndex.value,
      player: turnSpot ? "river" : "turn",
      selectedIndex: -1,
      prevPlayer: prevSpot.player,
      cards: Array.from({ length: 52 }, (_, i) => ({
        card: i,
        isSelected: false,
        isDead: true,
      })),
      pot: config.startingPot + 2 * totalBetAmount.value[0],
      stack: config.effectiveStack - totalBetAmount.value[0],
    },
    {
      type: "player",
      index: selectedSpotIndex.value + 1,
      player: "oop",
      selectedIndex: -1,
      // The new street starts from the chance spot's pot, with no bet yet.
      actions: toSpotActions(nextActions, {
        pot: config.startingPot + 2 * totalBetAmount.value[0],
        bet: 0,
      }),
    }
  );
};

const pushResultsPlayer = async () => {
  const prevSpot = spots.value[selectedSpotIndex.value - 1];
  const player = prevSpot.player === "oop" ? "ip" : "oop";

  const actions = await invokes.treeActions();

  spots.value.push({
    type: "player",
    index: selectedSpotIndex.value,
    player,
    selectedIndex: -1,
    actions: toSpotActions(
      actions,
      streetBets(spots.value, selectedSpotIndex.value)
    ),
  });
};

const play = async (spotIndex: number, actionIndex: number) => {
  const spot = spots.value[spotIndex] as SpotPlayer;

  if (spot.selectedIndex !== -1) {
    spot.actions[spot.selectedIndex].isSelected = false;
  }
  spot.actions[actionIndex].isSelected = true;
  spot.selectedIndex = actionIndex;

  await selectSpot(spotIndex + 1, true, false, true);
};

const addBetAction = async () => {
  const isRaise = totalBetAmount.value[0] !== totalBetAmount.value[1];
  await invokes.treeAddBetAction(betAmount.value, isRaise);
  await selectSpot(selectedSpotIndex.value, false, true, false);
  await refreshLines();
};

const removeSelectedNode = async () => {
  await invokes.treeRemoveCurrentNode();
  let prevIndex = selectedSpotIndex.value - 1;
  if (spots.value[prevIndex].type === "chance") --prevIndex;
  await selectSpot(prevIndex, false, true, true);
  await refreshLines();
};

// The parent knows the edit's lines at any time (to ask before they are lost).
watch(
  [addedLines, removedLines, invalidLinesArray],
  () =>
    emit("state", {
      added: addedLines.value,
      removed: removedLines.value,
      canSave: !isTreeError && invalidLinesArray.value.length === 0,
    }),
  { immediate: true }
);

const saveEdit = () => {
  emit("save", addedLines.value, removedLines.value);
};

const cancelEdit = () => {
  emit("cancel");
};

/** Undoes the `index`-th added or removed line. */
const deleteLine = async (kind: "added" | "removed", index: number) => {
  if (kind === "added") {
    await invokes.treeDeleteAddedLine(addedLines.value.split(",")[index]);
  } else {
    await invokes.treeDeleteRemovedLine(removedLines.value.split(",")[index]);
  }
  await selectSpot(selectedSpotIndex.value, false, true, false);
  await refreshLines();
};

await selectSpot(0, true, false, true);
</script>
