<template>
  <section>
    <header
      class="flex items-center gap-1.5 mb-2 text-[11px] font-semibold tracking-[0.07em] text-muted"
    >
      <span class="mr-auto">BET SIZES</span>
      <button
        type="button"
        class="px-1.5 rounded hover:bg-panel2 hover:text-ink normal-case tracking-normal font-normal disabled:opacity-40"
        :disabled="locked || sideErrors.oop"
        title="Copy OOP's sizes to IP"
        @click="copySizes('oop', 'ip')"
      >
        OOP → IP
      </button>
      <button
        type="button"
        class="px-1.5 rounded hover:bg-panel2 hover:text-ink normal-case tracking-normal font-normal disabled:opacity-40"
        :disabled="locked || sideErrors.ip"
        title="Copy IP's sizes to OOP"
        @click="copySizes('ip', 'oop')"
      >
        IP → OOP
      </button>
      <UiTooltip>
        <span
          class="normal-case tracking-normal font-normal underline decoration-dotted decoration-muted/50 underline-offset-[3px] cursor-help"
          >How to input</span
        >
        <template #content>
          <p>
            Several sizes per field, separated by commas or spaces. Empty: no
            bet or raise.
          </p>
          <ul class="mt-1 pl-4 list-disc">
            <li>
              A share of the pot: "50" or "50%". A raise first calls, then bets
              that share: pot 100, bet 75, a 50% raise is 75 + (100 + 75 + 75) ×
              50% = 200.
            </li>
            <li>A multiple of the previous bet (raises only): "2.5x".</li>
            <li>All-in: "a".</li>
            <li>
              A fixed amount: "100c"; for raises, a cap on the number of raises:
              "20c3r".
            </li>
            <li>
              Geometric: "3e" splits the remaining stack into 3 equal bets in %
              of the pot ("e" alone: the streets left); "2e200" caps it at 200%.
            </li>
          </ul>
        </template>
      </UiTooltip>
    </header>

    <table class="w-full text-xs">
      <thead>
        <tr class="text-muted">
          <th class="pb-1 text-left font-semibold" />
          <th
            v-for="street in STREETS"
            :key="street"
            class="pb-1 text-left font-semibold"
          >
            {{ street }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <td class="pr-1.5 py-0.5 whitespace-nowrap text-muted">
            {{ row.label }}
          </td>
          <td v-for="(field, i) in row.fields" :key="i" class="py-0.5 pr-1">
            <input
              v-if="field"
              v-model="config[field]"
              type="text"
              :disabled="locked"
              :title="errors[field] ?? ''"
              :class="[
                'ui-input h-7 w-full px-1.5 text-xs',
                errors[field] ? '!border-red-500' : '',
              ]"
              @blur="sanitize(field)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <ul v-if="betErrors.length > 0" class="mt-2 text-xs text-red-400">
      <li v-for="error in betErrors" :key="error">{{ error }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useConfigStore } from "../../store";
import { setupErrors } from "../../setup-validation";
import { sanitizeBetString } from "../../utils";
import { hasManualEdits } from "../../tree-config-value";
import UiTooltip from "../ui/UiTooltip.vue";

type BetField =
  | "oopFlopBet"
  | "oopFlopRaise"
  | "oopTurnBet"
  | "oopTurnRaise"
  | "oopTurnDonk"
  | "oopRiverBet"
  | "oopRiverRaise"
  | "oopRiverDonk"
  | "ipFlopBet"
  | "ipFlopRaise"
  | "ipTurnBet"
  | "ipTurnRaise"
  | "ipRiverBet"
  | "ipRiverRaise";

const STREETS = ["Flop", "Turn", "River"];

const config = useConfigStore();
const locked = computed(() => hasManualEdits(config));
const errors = reactive<Partial<Record<BetField, string>>>({});

// A field outlined as invalid is checked again when its value changes from elsewhere.
watch(
  () => (Object.keys(errors) as BetField[]).map((field) => config[field]),
  () => {
    for (const field of Object.keys(errors) as BetField[]) {
      const result = sanitizeBetString(config[field], field.endsWith("Raise"));
      if (result.valid) delete errors[field];
      else errors[field] = result.s;
    }
  }
);

const rows = computed(() => {
  const list: { label: string; fields: (BetField | null)[] }[] = [
    { label: "OOP bet", fields: ["oopFlopBet", "oopTurnBet", "oopRiverBet"] },
    {
      label: "OOP raise",
      fields: ["oopFlopRaise", "oopTurnRaise", "oopRiverRaise"],
    },
    { label: "IP bet", fields: ["ipFlopBet", "ipTurnBet", "ipRiverBet"] },
    {
      label: "IP raise",
      fields: ["ipFlopRaise", "ipTurnRaise", "ipRiverRaise"],
    },
  ];
  if (config.donkOption) {
    list.push({
      label: "OOP donk",
      fields: [null, "oopTurnDonk", "oopRiverDonk"],
    });
  }
  return list;
});

/** Tidies a valid entry; keeps an invalid one as typed, outlined, with the reason. */
const sanitize = (field: BetField) => {
  const result = sanitizeBetString(config[field], field.endsWith("Raise"));
  if (result.valid) {
    config[field] = result.s;
    delete errors[field];
  } else {
    errors[field] = result.s;
  }
};

/** Copies one player's bet and raise sizes (not the donk sizes) to the other. */
const copySizes = (from: "oop" | "ip", to: "oop" | "ip") => {
  for (const street of STREETS) {
    for (const kind of ["Bet", "Raise"]) {
      config[`${to}${street}${kind}` as BetField] =
        config[`${from}${street}${kind}` as BetField];
    }
  }
};

const betErrors = computed(() => {
  const all = setupErrors(config);
  return [...all.oop, ...all.ip];
});
/** A side with an invalid size is not copied. */
const sideErrors = computed(() => {
  const all = setupErrors(config);
  return { oop: all.oop.length > 0, ip: all.ip.length > 0 };
});
</script>
