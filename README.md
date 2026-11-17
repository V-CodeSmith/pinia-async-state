# pinia-async-state

> A tiny Pinia plugin that automatically tracks **loading** and **error** state for every async action — no boilerplate.

[![npm version](https://img.shields.io/npm/v/pinia-async-state.svg)](https://www.npmjs.com/package/pinia-async-state)
[![npm downloads](https://img.shields.io/npm/dm/pinia-async-state.svg)](https://www.npmjs.com/package/pinia-async-state)
[![bundle size](https://img.shields.io/bundlephobia/minzip/pinia-async-state)](https://bundlephobia.com/package/pinia-async-state)
[![CI](https://github.com/V-CodeSmith/pinia-async-state/actions/workflows/ci.yml/badge.svg)](https://github.com/V-CodeSmith/pinia-async-state/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)

---

## The Problem

Every Pinia store with async actions ends up repeating the same `loading` / `error` boilerplate. A typical store with three async actions looks like this:

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
    async deleteUser(id: number) {
      this.loading = true;
      this.error = null;
      try {
        await api.delete(`/users/${id}`);
        this.users = this.users.filter((u) => u.id !== id);
      } catch (e) {
        this.error = e as Error;
      } finally {
        this.loading = false;
      }
    },
    async updateUser(id: number, patch: Partial<User>) {
      this.loading = true;
      this.error = null;
      try {
        const updated = await api.patch(`/users/${id}`, patch);
        this.users = this.users.map((u) => (u.id === id ? updated : u));
      } catch (e) {
        this.error = e as Error;
      } finally {
        this.loading = false;
      }
    },
  },
});
```

**~45 lines** — but only **3 lines per action** are real business logic. Multiply this by every store in your app and it becomes hundreds of lines of noise.

Worse, `loading` is a single boolean, so if two actions run in parallel, the first one to finish sets `loading = false` while the second is still running. The same problem exists for `error`.

---

## The Solution

Install the plugin **once** in your app:

```ts
// main.ts
import { createPinia } from "pinia";
import { createPiniaAsyncStatePlugin } from "pinia-async-state";

const pinia = createPinia().use(createPiniaAsyncStatePlugin());
```

Now rewrite the **same store** — the boilerplate is gone:

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
    async updateUser(id: number, patch: Partial<User>) {
      const updated = await api.patch(`/users/${id}`, patch);
      this.users = this.users.map((u) => (u.id === id ? updated : u));
    },
  },
});
```

**~15 lines.** Same behavior. Zero boilerplate. The plugin automatically:

- Sets `$loading` to `true` when any action starts
- Sets `$loading` back to `false` only when **all** pending actions finish
- Captures errors in `$error` without interfering with your `try/catch`
- Tracks which actions are currently running in `$pendingActions`

---

## What you get for free

Every store — whether Options Store or Setup Store — automatically exposes these:

| Property             | Type            | Description                                                   |
| -------------------- | --------------- | ------------------------------------------------------------- |
| `$loading`           | `boolean`       | `true` while at least one action is pending                   |
| `$error`             | `Error \| null` | Last error thrown by any action (auto-cleared on next action) |
| `$pendingActions`    | `string[]`      | Names of currently running actions                            |
| `$resetAsyncState()` | `() => void`    | Manually clear `$loading`, `$error`, and `$pendingActions`    |

Use them directly in any component:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useUsersStore } from "~/stores/users";

const store = useUsersStore();
onMounted(() => store.fetchUsers());
</script>

<template>
  <Spinner v-if="store.$loading" />
  <ErrorBanner v-if="store.$error" :message="store.$error.message" />
  <UserList v-else :users="store.users" />
</template>
```

Because `$loading` and `$error` live on the **store itself**, every component that calls `useUsersStore()` sees the same state — no syncing, no prop drilling.

---

## Install

```bash
npm install pinia-async-state
```

```bash
pnpm add pinia-async-state
```

```bash
yarn add pinia-async-state
```

**Peer dependencies:** `vue@^3.3.0`, `pinia@^2.0.0`

---

## Usage

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

### Nuxt 3

```ts
// plugins/pinia.ts
import { createPiniaAsyncStatePlugin } from "pinia-async-state";

export default defineNuxtPlugin(({ $pinia }) => {
  $pinia.use(createPiniaAsyncStatePlugin());
});
```

> Make sure `@pinia/nuxt` is installed and the plugin is registered **after** the Pinia module is loaded.

### Composition API (Setup Store)

Works identically — the plugin operates at the store level, not the action level:

```ts
// stores/users.ts
import { defineStore } from "pinia";
import { ref } from "vue";

export const useUsersStore = defineStore("users", () => {
  const users = ref<User[]>([]);

  async function fetchUsers() {
    users.value = await api.get("/users");
  }

  return { users, fetchUsers };
});
```

In the component, `store.$loading` and `store.$error` behave exactly as with Options Stores.

---

## Options

```ts
pinia.use(
  createPiniaAsyncStatePlugin({
    logErrors: false, // default: false — log every action error to console.error
    resetOnAction: true, // default: true  — clear $error at the start of each action
  }),
);
```

| Option          | Type      | Default | Description                                                                                                                      |
| --------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `logErrors`     | `boolean` | `false` | If `true`, every error thrown by an action is logged via `console.error` with the action name.                                   |
| `resetOnAction` | `boolean` | `true`  | If `true`, `$error` is cleared at the start of each action. Set to `false` if you want the last error to persist across actions. |

---

## Opting out for a specific store

If a store shouldn't get the auto-injected properties, set `asyncState: false` in the store options:

```ts
export const useSystemStore = defineStore("system", {
  state: () => ({ config: {} }),
  actions: {
    async loadConfig() {
      /* ... */
    },
  },
  asyncState: false,
});
```

For Setup Stores:

```ts
export const useSystemStore = defineStore(
  "system",
  () => {
    // ...
  },
  {
    asyncState: false,
  },
);
```

The plugin will skip this store entirely — `$loading`, `$error`, `$pendingActions`, and `$resetAsyncState` won't be added.

---

## API Reference

### `createPiniaAsyncStatePlugin(options?)`

Factory that returns a Pinia plugin. Pass the returned plugin to `pinia.use(...)`.

```ts
import { createPinia } from "pinia";
import { createPiniaAsyncStatePlugin } from "pinia-async-state";

const pinia = createPinia().use(
  createPiniaAsyncStatePlugin({ logErrors: true }),
);
```

**Parameters:**

- `options.logErrors?: boolean` — default `false`
- `options.resetOnAction?: boolean` — default `true`

**Returns:** a `PiniaPlugin` function.

### Store properties (injected)

#### `$loading: boolean`

`true` while **at least one** action is pending. Becomes `false` only when all pending actions have finished. Safe for parallel actions.

#### `$error: Error | null`

The last error thrown by any action in this store. If `resetOnAction` is `true` (default), it is cleared at the start of every action. The error is also re-thrown normally — so your existing `try/catch` keeps working.

#### `$pendingActions: string[]`

Names of actions currently in-flight. Useful for showing which operation is running (e.g., a "Saving…" label vs a "Loading…" spinner).

#### `$resetAsyncState(): void`

Manually reset `$loading`, `$error`, and `$pendingActions`. Handy after the user dismisses an error banner:

```ts
function dismissError() {
  store.$resetAsyncState();
}
```

---

## Why not just…?

### Why not `useAsyncState` from VueUse?

`useAsyncState` works at the **component** level — each component that calls it gets its own independent state. If three components fetch the same data, you get three separate loading flags. This plugin works at the **store** level, so there's exactly one source of truth.

### Why not write a custom composable?

You can — and for a single store, that's fine. But you'd have to wrap every action manually:

```ts
const { loading, error, run } = useAsyncAction(fetchUsers);
await run();
```

This plugin requires **zero changes to your actions**. You write the action as you normally would, and `$loading` / `$error` are there automatically. It also composes with `pinia-plugin-persistedstate` and other Pinia plugins without conflict.

### Does it interfere with `pinia-plugin-persistedstate`?

No. This plugin only adds `$`-prefixed properties to the store instance and never touches `state()`. It's fully compatible.

---

## Compatibility

| Package    | Version                      |
| ---------- | ---------------------------- |
| Vue        | `^3.3.0`                     |
| Pinia      | `^2.0.0`                     |
| Nuxt       | `^3.0.0` (via `@pinia/nuxt`) |
| TypeScript | `^5.0.0`                     |
| Node       | `>=18`                       |

---

## Development

```bash
# Install dependencies
npm install

# Run tests in watch mode
npm run test:watch

# Run tests once
npm test

# Type check
npm run typecheck

# Build for production
npm run build
```

Built with [tsup](https://tsup.egoist.dev/) and tested with [Vitest](https://vitest.dev/).

---

## Contributing

Issues and pull requests are welcome. If you found this plugin useful, a ⭐ on GitHub goes a long way.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m "feat: add my feature"`)
4. Push and open a Pull Request

---

## License

[MIT](./LICENSE) © V-CodeSmith
