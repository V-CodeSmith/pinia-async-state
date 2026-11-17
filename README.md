# pinia-async-state

> A tiny Pinia plugin that automatically tracks **loading** and **error** state for every async action — no boilerplate.

[![npm version](https://img.shields.io/npm/v/pinia-async-state.svg)](https://www.npmjs.com/package/pinia-async-state)
[![CI](https://github.com/V-CodeSmith/pinia-async-state/actions/workflows/ci.yml/badge.svg)](https://github.com/V-CodeSmith/pinia-async-state/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## The Problem

Every Pinia action that calls an API needs the same boilerplate:

```ts
const loading = ref(false);
const error = ref<Error | null>(null);

async function fetchUsers() {
  loading.value = true;
  error.value = null;
  try {
    // ...real logic
  } catch (e) {
    error.value = e as Error;
  } finally {
    loading.value = false;
  }
}
```
