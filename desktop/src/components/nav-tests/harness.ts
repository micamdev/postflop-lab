import { createRenderer, h, ref, defineComponent, nextTick } from "vue";

// Test harness: mounts ResultNav with a no-DOM renderer and a parent that owns its v-models.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type N = {
  tag: string;
  props: Record<string, any>;
  children: N[];
  parent: N | null;
  text: string;
};
const mk = (tag: string): N => ({
  tag,
  props: {},
  children: [],
  parent: null,
  text: "",
});

const { createApp } = createRenderer<N, N>({
  createElement: (tag) => mk(tag),
  createText: (t) => ({ ...mk("#text"), text: t }),
  createComment: (t) => ({ ...mk("#comment"), text: t }),
  setText: (n, t) => {
    n.text = t;
  },
  setElementText: (n, t) => {
    n.children = [];
    n.text = t;
  },
  insert: (child, parent, anchor) => {
    if (child.parent)
      child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = parent;
    const i = anchor ? parent.children.indexOf(anchor) : -1;
    if (i === -1) parent.children.push(child);
    else parent.children.splice(i, 0, child);
  },
  remove: (child) => {
    if (child.parent) {
      child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = null;
    }
  },
  parentNode: (n) => n.parent,
  nextSibling: (n) => {
    if (!n.parent) return null;
    const c = n.parent.children;
    return c[c.indexOf(n) + 1] ?? null;
  },
  patchProp: (el, key, _prev, next) => {
    el.props[key] = next;
  },
});

export const textOf = (n: N): string =>
  n.text + n.children.map(textOf).join("");
export const findAll = (n: N, pred: (n: N) => boolean, out: N[] = []): N[] => {
  if (pred(n)) out.push(n);
  n.children.forEach((c) => findAll(c, pred, out));
  return out;
};
export const click = (n: N) =>
  n.props.onClick({ stopPropagation() {}, preventDefault() {} });
export const flush = async (k = 20) => {
  for (let i = 0; i < k; i++) {
    await nextTick();
    await Promise.resolve();
  }
};

export const mountNav = (
  ResultNav: any,
  extraProps: Record<string, any> = {}
) => {
  const isLocked = ref(false);
  const isHandlerUpdated = ref(false);
  const dealtCard = ref(-1);
  const resolveRequest = ref<any>(null);
  const updates: any[][] = [];
  const Parent = defineComponent({
    setup() {
      return () =>
        h(ResultNav, {
          isHandlerUpdated: isHandlerUpdated.value,
          isLocked: isLocked.value,
          cards: [[], []],
          dealtCard: dealtCard.value,
          resolveRequest: resolveRequest.value,
          "onUpdate:isHandlerUpdated": (v: boolean) =>
            (isHandlerUpdated.value = v),
          "onUpdate:isLocked": (v: boolean) => (isLocked.value = v),
          onTriggerUpdate: (...args: any[]) => {
            updates.push(args);
            isLocked.value = false;
            dealtCard.value = -1;
          },
          ...extraProps,
        });
    },
  });
  const root = mk("root");
  const app = createApp(Parent);
  return {
    app,
    root,
    isLocked,
    isHandlerUpdated,
    dealtCard,
    resolveRequest,
    updates,
  };
};
