# pinia-async-state

> A tiny Pinia plugin that tracks **loading** and **error** state for every async action — per store **and** per action, with zero boilerplate.

[![npm version](https://img.shields.io/npm/v/pinia-async-state.svg)](https://www.npmjs.com/package/pinia-async-state)
[![GitHub release](https://img.shields.io/github/v/release/V-CodeSmith/pinia-async-state)](https://github.com/V-CodeSmith/pinia-async-state/releases)
[![npm downloads](https://img.shields.io/npm/dm/pinia-async-state.svg)](https://www.npmjs.com/package/pinia-async-state)
[![bundle size](https://img.shields.io/bundlephobia/minzip/pinia-async-state)](https://bundlephobia.com/package/pinia-async-state)
[![CI](https://github.com/V-CodeSmith/pinia-async-state/actions/workflows/ci.yml/badge.svg)](https://github.com/V-CodeSmith/pinia-async-state/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)

---

## The Problem

Every Pinia store with async actions ends up repeating the same `loading` / `error` boilerplate:

```ts
// stores/users.ts
export const useUsersStore = defineStore("users", {
  state: () => ({
    users: [] as User[],
    loading: false,
    error: null as Error | null,
  }),
  actions: {
    async fetchUsers() {
      this.loading = true;
      this.error = null;
      try {
        this.users = await api.get("/users");
      } catch (e) {
        this.error = e as Error;
      } finally {
        this.loading = false;
      }
    },
    // ...same 10 lines for every other async action
  },
});
```

Worse, `loading` is a single boolean: if two actions run in parallel, the first one to finish sets `loading = false` while the second is still running.

## The Solution

Install the plugin **once**:

```ts
// main.ts
import { createPinia } from "pinia";
import { createPiniaAsyncStatePlugin } from "pinia-async-state";

const pinia = createPinia().use(createPiniaAsyncStatePlugin());
```

Now write plain actions — the state is there automatically:

```ts
// stores/users.ts
export const useUsersStore = defineStore("users", {
  state: () => ({
    users: [] as User[],
  }),
  actions: {
    async fetchUsers() {
      this.users = await api.get("/users");
    },
    async deleteUser(id: number) {
      await api.delete(`/users/${id}`);
      this.users = this.users.filter((u) => u.id !== id);
    },
  },
});
```

```vue
<script setup lang="ts">
const store = useUsersStore();
onMounted(() => store.fetchUsers());
</script>

<template>
  <!-- whole-store loading: correct even with parallel actions -->
  <Spinner v-if="store.$loading" />
  <ErrorBanner v-if="store.$error" :message="store.$error.message" />

  <UserList :users="store.users" />

  <!-- per-action loading, no matter what else is running -->
  <button :disabled="store.$async.deleteUser.loading">
    {{ store.$async.deleteUser.loading ? "Deleting…" : "Delete" }}
  </button>
</template>
```

---

## Install

```bash
npm install pinia-async-state
# or
pnpm add pinia-async-state
# or
yarn add pinia-async-state
```

**Peer dependencies:** `vue@^3.3.0`, `pinia@^2.1.7 || ^3.0.0`

## Setup

### Vue 3

```ts
// main.ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import { createPiniaAsyncStatePlugin } from "pinia-async-state";
import App from "./App.vue";

const pinia = createPinia().use(createPiniaAsyncStatePlugin());

createApp(App).use(pinia).mount("#app");
```

### Nuxt 3 / 4

```ts
// plugins/pinia-async-state.ts
import { createPiniaAsyncStatePlugin } from "pinia-async-state";

export default defineNuxtPlugin(({ $pinia }) => {
  $pinia.use(createPiniaAsyncStatePlugin());
});
```

Make sure `@pinia/nuxt` is installed and this plugin loads after Pinia (the `$pinia` injection requires it).

---

## What you get

Every store (Options or Setup) automatically exposes:

| Property                 | Type                        | Description                                              |
| ------------------------ | --------------------------- | -------------------------------------------------------- |
| `$loading`               | `boolean`                   | `true` while **any** tracked call is pending             |
| `$error`                 | `Error \| null`             | Last error thrown by any action                          |
| `$errorInfo`             | `AsyncErrorInfo \| null`    | Last error plus `action`, `storeId`, `raw` and `at`      |
| `$pendingActions`        | `string[]`                  | Unique names of the running actions (a fresh array)      |
| `$pendingCount`          | `number`                    | Number of in-flight calls (re-entrant calls count twice) |
| `$async`                 | `AsyncActionRegistry`       | Per-action state — `$async.fetchUsers.loading`           |
| `$isActionPending(name)` | `(name: string) => boolean` | Is this specific action running?                         |
| `$clearError()`          | `() => void`                | Clear `$error`, `$errorInfo` and every action error      |
| `$resetAction(name)`     | `(name: string) => void`    | Reset loading/error/timestamps of one action             |
| `$resetAsyncState()`     | `() => void`                | Reset everything for this store                          |
| `$waitForIdle()`         | `() => Promise<void>`       | Resolves when nothing is pending anymore                 |
| `$track(name, work)`     | `(name, promise) => Promise`| Track any promise as if it were an action                |

### Per-action state

`store.$async.<actionName>` is reactive and read-only:

```ts
store.$async.fetchUsers.loading; // boolean
store.$async.fetchUsers.error; // Error | null
store.$async.fetchUsers.pendingCount; // in-flight calls of this action
store.$async.fetchUsers.runCount; // how many times it ran
store.$async.fetchUsers.lastRunAt; // timestamp | null
store.$async.fetchUsers.lastSuccessAt; // timestamp | null
```

So you can render an independent spinner per action, without any extra flags in your store:

```vue
<template>
  <Spinner v-if="store.$async.fetchUsers.loading" />
  <button :disabled="store.$async.saveProfile.loading">
    {{ store.$async.saveProfile.loading ? "Saving…" : "Save" }}
  </button>
</template>
```

---

## Options

```ts
pinia.use(
  createPiniaAsyncStatePlugin({
    logErrors: false,
    resetOnAction: true,
    only: undefined,
    exclude: [],
    minLoadingTime: 0,
    normalizeError: undefined,
    onError: undefined,
  }),
);
```

| Option            | Type                                                    | Default     | Description                                                                                       |
| ----------------- | ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `logErrors`       | `boolean`                                               | `false`     | Log every failed action to `console.error`                                                        |
| `resetOnAction`   | `boolean`                                               | `true`      | Clear `$error` (and the action's own error) when an action starts                                 |
| `only`            | `string[]`                                              | `undefined` | Track only these action names                                                                     |
| `exclude`         | `string[]`                                              | `[]`        | Never track these action names (e.g. `["hydrate", "internal"]`)                                   |
| `minLoadingTime`  | `number`                                                | `0`         | Keep `$loading` true for at least this many ms, so fast requests don't flash a spinner            |
| `normalizeError`  | `(raw, origin) => Error`                                | –           | Convert whatever your action threw into an `Error`                                                |
| `onError`         | `({ storeId, action, error, raw }) => void`             | –           | Called for every failed action — perfect for toasts, Sentry, logging                              |

### Error hook example

```ts
createPiniaAsyncStatePlugin({
  onError: ({ storeId, action, error }) => {
    if (action === "login") return; // expected failures
    toast.error(error.message);
    Sentry.captureException(error, { tags: { storeId, action } });
  },
});
```

### No spinner flicker

```ts
createPiniaAsyncStatePlugin({ minLoadingTime: 300 });
```

A request that finishes in 40 ms no longer flashes the spinner for 40 ms — `$loading` stays `true` for 300 ms.

### Only track what matters

```ts
createPiniaAsyncStatePlugin({
  exclude: ["trackPageView", "prefetch"],
});
```

Or per store:

```ts
export const useAnalyticsStore = defineStore("analytics", {
  state: () => ({}),
  actions: {
    async trackPageView() {},
    async sendEvent() {},
  },
  asyncState: { exclude: ["trackPageView"] },
});
```

---

## Utilities

### `$track` — async work outside actions

`$onAction` only sees real Pinia actions. Wrap anything else and it is tracked the same way:

```ts
await store.$track("uploadAvatar", () => uploadFile(file));
// store.$async.uploadAvatar.loading is true while it runs
```

A promise is accepted too: `store.$track("uploadAvatar", uploadFile(file))`.

### `$waitForIdle` — wait for everything

```ts
await store.$waitForIdle(); // e.g. before SSR serialization or navigation guards
```

### Clearing errors

```ts
store.$clearError(); // user dismissed the error banner
store.$resetAction("deleteUser"); // forget one action's state
store.$resetAsyncState(); // forget the whole store's async state
```

> `$resetAsyncState()` and `$resetAction()` force-clear loading counters. Calls that were already
> in flight when you reset are no longer tracked, so they can't flip `$loading` back on afterwards.

---

## Opting out per store

```ts
export const useSystemStore = defineStore("system", {
  state: () => ({ config: {} }),
  actions: {
    async loadConfig() {},
  },
  asyncState: false,
});
```

Setup stores take the same flag as the third argument:

```ts
export const useSystemStore = defineStore("system", () => ({}), {
  asyncState: false,
});
```

The plugin skips the store entirely — no `$loading`, `$error`, `$async`, … are injected.
TypeScript still types them as present (Pinia cannot express per-store conditionals); if you need the
types to match, use `Omit<typeof store, keyof AsyncState>`.

---

## Recipes

### Manual refresh button

```ts
async function refresh() {
  try {
    await store.fetchUsers();
  } catch {
    // already in store.$error, and onError already fired
  }
}
```

### Global progress bar

```ts
const stores = [useUsersStore(), usePostsStore()];
const anyLoading = computed(() => stores.some((s) => s.$loading));
```

### Retry helper

```ts
async function retry<T>(fn: () => Promise<T>, times = 3): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (times <= 1) throw error;
    return retry(fn, times - 1);
  }
}

await store.$track("refreshUsers", () => retry(() => store.fetchUsers()));
```

---

## Compatibility

| Package    | Version                      |
| ---------- | ---------------------------- |
| Vue        | `^3.3.0`                     |
| Pinia      | `^2.1.7` \|\| `^3.0.0`       |
| Nuxt       | `^3.0.0` (via `@pinia/nuxt`) |
| TypeScript | `^5.0.0`                     |
| Node       | `>=18`                       |

Errors are always re-thrown, so your own `try/catch` keeps working and unhandled rejections are not swallowed.
The plugin only adds `$`-prefixed properties and never touches `state()`, so it composes with
`pinia-plugin-persistedstate` and other Pinia plugins.

---

## Migration from 0.1

Everything from `0.1` keeps working. New in `0.2`:

- `$async` per-action state, `$pendingCount`, `$isActionPending`, `$errorInfo`
- `$clearError`, `$resetAction`, `$waitForIdle`, `$track`
- options `only`, `exclude`, `minLoadingTime`, `normalizeError`, `onError`
- per-store `asyncState: { only, exclude }`
- Pinia 3 support, correct CJS/ESM type declarations

Behavior changes:

- `$pendingActions` is now a **copy** (one entry per action), so mutating it can no longer corrupt the state
- `$resetAsyncState()` also ignores in-flight calls that started before the reset

---

## Development

```bash
npm install

npm run test:watch   # tests in watch mode
npm test             # tests once
npm run typecheck    # tsc
npm run build        # tsup -> dist (esm + cjs + d.ts)
```

Built with [tsup](https://tsup.egoist.dev/) and tested with [Vitest](https://vitest.dev/).

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m "feat: add my feature"`)
4. Push and open a Pull Request

## License

[MIT](./LICENSE) © V-CodeSmith
