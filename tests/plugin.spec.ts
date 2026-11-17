import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, defineStore, setActivePinia } from "pinia";
import { createApp } from "vue";
import { createPiniaAsyncStatePlugin } from "../src/index.ts";

describe("pinia-async-state", () => {
  beforeEach(() => {
    const app = createApp({});
    const pinia = createPinia().use(createPiniaAsyncStatePlugin());
    app.use(pinia);
    setActivePinia(pinia);
  });

  it("should set $loading to true while action is pending", async () => {
    const useStore = defineStore("test", {
      state: () => ({ value: 0 }),
      actions: {
        async fetchData() {
          await new Promise((r) => setTimeout(r, 10));
          this.value = 1;
        },
      },
    });
    const store = useStore();
    const promise = store.fetchData();
    expect(store.$loading).toBe(true);
    await promise;
    expect(store.$loading).toBe(false);
    expect(store.value).toBe(1);
  });

  it("should capture errors from failed actions", async () => {
    const useStore = defineStore("test2", {
      state: () => ({}),
      actions: {
        async failAction() {
          throw new Error("boom");
        },
      },
    });
    const store = useStore();
    await expect(store.failAction()).rejects.toThrow("boom");
    expect(store.$error).toBeInstanceOf(Error);
    expect(store.$error?.message).toBe("boom");
    expect(store.$loading).toBe(false);
  });

  it("should track multiple pending actions", async () => {
    const useStore = defineStore("test3", {
      state: () => ({}),
      actions: {
        async a() {
          await new Promise((r) => setTimeout(r, 20));
        },
        async b() {
          await new Promise((r) => setTimeout(r, 10));
        },
      },
    });
    const store = useStore();
    const p1 = store.a();
    const p2 = store.b();
    expect(store.$pendingActions).toContain("a");
    expect(store.$pendingActions).toContain("b");
    await Promise.all([p1, p2]);
    expect(store.$pendingActions).toHaveLength(0);
  });

  it("should reset state manually", async () => {
    const useStore = defineStore("test4", {
      state: () => ({}),
      actions: {
        async fail() {
          throw new Error("x");
        },
      },
    });
    const store = useStore();
    await expect(store.fail()).rejects.toThrow();
    store.$resetAsyncState();
    expect(store.$error).toBeNull();
    expect(store.$loading).toBe(false);
  });

  it("should respect logErrors option", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({});
    const pinia = createPinia().use(
      createPiniaAsyncStatePlugin({ logErrors: true }),
    );
    app.use(pinia);
    setActivePinia(pinia);
    const useStore = defineStore("test5", {
      state: () => ({}),
      actions: {
        async fail() {
          throw new Error("logged");
        },
      },
    });
    await expect(useStore().fail()).rejects.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
