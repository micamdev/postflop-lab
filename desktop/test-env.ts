// Vitest environment for the navigation tests: components compiled for the browser (not SSR),
// without a DOM (the tests mount them with their own renderer).
export default {
  name: "web-no-dom",
  viteEnvironment: "client",
  transformMode: "web",
  setup() {
    return { teardown() {} };
  },
};
