// Range text typed by the user ("AA,KQs,T9s-76s:0.5"), checked before the engine parses it.

import { rangeRegex, trimRegex } from "./utils";

export const parseRangeText = (
  text: string
): { ok: true; text: string } | { ok: false; error: string } => {
  const trimmed = text.replace(trimRegex, "$1").trim();
  const parts = trimmed.split(",");
  if (parts[parts.length - 1] === "") parts.pop();

  for (const part of parts) {
    if (!rangeRegex.test(part)) {
      return {
        ok: false,
        error: `Failed to parse range: ${part || "(empty string)"}`,
      };
    }
  }
  return { ok: true, text: parts.join(",") };
};
