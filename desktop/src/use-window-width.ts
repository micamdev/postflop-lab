import { onUnmounted, ref } from "vue";

/** The window's inner width, updated on resize. */
export const useWindowWidth = () => {
  const width = ref(window.innerWidth);
  const update = () => (width.value = window.innerWidth);
  window.addEventListener("resize", update);
  onUnmounted(() => window.removeEventListener("resize", update));
  return width;
};
