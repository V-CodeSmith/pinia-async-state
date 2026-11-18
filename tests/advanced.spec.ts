import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, defineStore, setActivePinia } from "pinia";
import { createApp, ref } from "vue";
import { createPiniaAsyncStatePlugin } from "../src/index.ts";
import type { PiniaAsyncStateOptions } from "../src/index.ts";

function setup(options?: PiniaAsyncStateOptions) {
  const pinia = createPinia().use(createPiniaAsyncStatePlugin(options));
  createApp({}).use(pinia);
  setActivePinia(pinia);
  return pinia;
}

const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("per-action state", () => {
  it("exposes loading, error and run metadata for each action", async () => {
    setup();
    const store = defineStore("perAction", {
      state: () => ({}),
      actions: {
        async load() {
          await tick();
        },
        async save() {
          await tick(10);
        },
      },
    })();

    const loadPromise = store.load();
    const savePromise = store.save();

    expect(store.$async.load.loading).toBe(true);
    expect(store.$async.save.loading).toBe(true);
    expect(store.$async.load.runCount).toBe(1);
    expect(store.$async.load.lastRunAt).toBeTypeOf("number");
    expect(store.$async.load.lastSuccessAt).toBeNull();
    expect(store.$isActionPending("load")).toBe(true);
    expect(store.$isActionPending("neverRan")).toBe(false);

    await Promise.all([loadPromise, savePromise]);

    expect(store.$async.load.loading).toBe(false);
    expect(store.$async.load.lastSuccessAt).toBeTypeOf("number");
    expect(store.$isActionPending("load")).toBe(false);
  });

  it("keeps one entry per action name and counts re-entrant calls", async () => {
    setup();
    const store = defineStore("reentrant", {
      state: () => ({}),
      actions: {
        async act() {
          await tick();
        },
      },
    })();

    const first = store.act();
    const second = store.act();

    expect(store.$pendingActions).toEqual(["act"]);
    expect(store.$pendingCount).toBe(2);
    expect(store.$async.act.pendingCount).toBe(2);

    await Promise.all([first, second]);

    expect(store.$pendingActions).toEqual([]);
    expect(store.$pendingCount).toBe(0);
    expect(store.$async.act.runCount).toBe(2);
  });

  it("does not let external mutation of $pendingActions corrupt the state", async () => {
    setup();
    const store = defineStore("immutable", {
      state: () => ({}),
      actions: {
        async act() {
          await tick();
        },
      },
    })();

    const promise = store.act();
    store.$pendingActions.push("fake");
    await promise;

    expect(store.$loading).toBe(false);
    expect(store.$pendingActions).toEqual([]);
    expect(store.$isActionPending("fake")).toBe(false);
  });
});

describe("error handling", () => {
  it("stores $errorInfo with the action, store and raw value", async () => {
    setup();
    const store = defineStore("errorInfo", {
      state: () => ({}),
      actions: {
        async fail() {
          throw new Error("boom");
        },
      },
    })();

    await expect(store.fail()).rejects.toThrow("boom");

    expect(store.$errorInfo).not.toBeNull();
    expect(store.$errorInfo?.action).toBe("fail");
    expect(store.$errorInfo?.storeId).toBe("errorInfo");
    expect(store.$errorInfo?.error).toBeInstanceOf(Error);
    expect(store.$errorInfo?.at).toBeTypeOf("number");
    expect(store.$errorInfo?.raw).toBeInstanceOf(Error);
  });

  it("normalizes non-Error throwables", async () => {
    setup();
    const store = defineStore("stringThrow", {
      state: () => ({}),
      actions: {
        async fail(): Promise<void> {
          throw "plain string";
        },
      },
    })();

    await expect(store.fail()).rejects.toBe("plain string");

    expect(store.$error).toBeInstanceOf(Error);
    expect(store.$error?.message).toBe("plain string");
    expect(store.$errorInfo?.raw).toBe("plain string");
    expect(store.$async.fail.error?.message).toBe("plain string");
  });

  it("supports a custom normalizeError", async () => {
    setup({
      normalizeError: (raw) => new Error(`normalized:${String(raw)}`),
    });
    const store = defineStore("customNormalize", {
      state: () => ({}),
      actions: {
        async fail(): Promise<void> {
          throw { status: 500 };
        },
      },
    })();

    await expect(store.fail()).rejects.toEqual({ status: 500 });

    expect(store.$error?.message).toBe("normalized:[object Object]");
  });

  it("calls the onError hook with the full context", async () => {
    const onError = vi.fn();
    setup({ onError });
    const store = defineStore("hooked", {
      state: () => ({}),
      actions: {
        async fail() {
          throw new Error("hooked");
        },
      },
    })();

    await expect(store.fail()).rejects.toThrow("hooked");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({
      storeId: "hooked",
      action: "fail",
      error: expect.any(Error),
      raw: expect.any(Error),
    });
  });

  it("does not break the action when the onError hook throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({
      onError: () => {
        throw new Error("handler exploded");
      },
    });
    const store = defineStore("badHook", {
      state: () => ({}),
      actions: {
        async fail() {
          throw new Error("original");
        },
      },
    })();

    await expect(store.fail()).rejects.toThrow("original");
    expect(store.$error?.message).toBe("original");
    spy.mockRestore();
  });

  it("clears errors with $clearError", async () => {
    setup();
    const store = defineStore("clearing", {
      state: () => ({}),
      actions: {
        async fail() {
          throw new Error("clear me");
        },
      },
    })();

    await expect(store.fail()).rejects.toThrow();
    expect(store.$error).not.toBeNull();

    store.$clearError();

    expect(store.$error).toBeNull();
    expect(store.$errorInfo).toBeNull();
    expect(store.$async.fail.error).toBeNull();
  });
});

describe("resetting", () => {
  it("resets a single action with $resetAction", async () => {
    setup();
    const store = defineStore("resetOne", {
      state: () => ({}),
      actions: {
        async first() {
          throw new Error("first");
        },
        async second() {
          throw new Error("second");
        },
      },
    })();

    await expect(store.first()).rejects.toThrow();
    await expect(store.second()).rejects.toThrow();

    store.$resetAction("first");

    expect(store.$async.first.error).toBeNull();
    expect(store.$async.first.runCount).toBe(0);
    expect(store.$async.first.loading).toBe(false);
    expect(store.$async.second.error?.message).toBe("second");
    expect(store.$error?.message).toBe("second");
  });

  it("ignores in-flight calls after $resetAsyncState", async () => {
    setup();
    const gate = deferred();
    const store = defineStore("resetRunning", {
      state: () => ({}),
      actions: {
        async slow() {
          await gate.promise;
        },
      },
    })();

    const promise = store.slow();
    expect(store.$loading).toBe(true);

    store.$resetAsyncState();

    expect(store.$loading).toBe(false);
    expect(store.$pendingActions).toEqual([]);
    expect(store.$pendingCount).toBe(0);

    gate.resolve();
    await promise;

    expect(store.$loading).toBe(false);
    expect(store.$async.slow.pendingCount).toBe(0);
    expect(store.$async.slow.loading).toBe(false);
  });
});

describe("tracking options", () => {
  it("only tracks the actions listed in `only`", async () => {
    setup({ only: ["tracked"] });
    const store = defineStore("onlyOption", {
      state: () => ({}),
      actions: {
        async tracked() {
          await tick();
        },
        async ignored() {
          await tick();
        },
      },
    })();

    const p1 = store.tracked();
    const p2 = store.ignored();

    expect(store.$isActionPending("tracked")).toBe(true);
    expect(store.$async.ignored).toBeUndefined();
    expect(store.$pendingCount).toBe(1);

    await Promise.all([p1, p2]);
    expect(store.$loading).toBe(false);
  });

  it("skips the actions listed in `exclude`", async () => {
    setup({ exclude: ["internal"] });
    const store = defineStore("excludeOption", {
      state: () => ({}),
      actions: {
        async internal() {
          await tick();
        },
        async visible() {
          await tick();
        },
      },
    })();

    const p1 = store.internal();
    const p2 = store.visible();

    expect(store.$async.internal).toBeUndefined();
    expect(store.$isActionPending("visible")).toBe(true);

    await Promise.all([p1, p2]);
  });

  it("supports per-store only/exclude configuration", async () => {
    setup({ exclude: ["globalSkip"] });
    const store = defineStore("storeOptions", {
      state: () => ({}),
      actions: {
        async keep() {
          await tick();
        },
        async skip() {
          await tick();
        },
        async globalSkip() {
          await tick();
        },
      },
      asyncState: { exclude: ["skip"] },
    })();

    const promises = [store.keep(), store.skip(), store.globalSkip()];

    expect(store.$isActionPending("keep")).toBe(true);
    expect(store.$async.skip).toBeUndefined();
    expect(store.$async.globalSkip).toBeUndefined();

    await Promise.all(promises);
  });

  it("does nothing for stores with asyncState: false", async () => {
    setup();
    const store = defineStore("optOut", {
      state: () => ({ count: 0 }),
      actions: {
        async go() {
          this.count = 1;
        },
      },
      asyncState: false,
    })();

    expect(store.$loading).toBeUndefined();

    await store.go();

    expect(store.count).toBe(1);
    expect(store.$error).toBeUndefined();
  });

  it("works with setup stores", async () => {
    setup();
    const store = defineStore("setupStore", () => {
      const count = ref(0);
      async function increment() {
        await tick();
        count.value += 1;
      }
      async function fail() {
        throw new Error("setup-fail");
      }
      return { count, increment, fail };
    })();

    const promise = store.increment();
    expect(store.$async.increment.loading).toBe(true);
    await promise;

    expect(store.count).toBe(1);
    expect(store.$async.increment.loading).toBe(false);
    expect(store.$async.increment.runCount).toBe(1);

    await expect(store.fail()).rejects.toThrow("setup-fail");
    expect(store.$async.fail.error?.message).toBe("setup-fail");
  });
});

describe("loading helpers", () => {
  it("keeps $loading true for at least minLoadingTime", async () => {
    vi.useFakeTimers();
    setup({ minLoadingTime: 100 });
    const gate = deferred();
    const store = defineStore("antiFlicker", {
      state: () => ({}),
      actions: {
        async quick() {
          await gate.promise;
        },
      },
    })();

    const promise = store.quick();
    expect(store.$loading).toBe(true);

    gate.resolve();
    await promise;

    expect(store.$loading).toBe(true);

    await vi.advanceTimersByTimeAsync(120);

    expect(store.$loading).toBe(false);
  });

  it("tracks arbitrary promises with $track", async () => {
    setup();
    const store = defineStore("trackHelper", {
      state: () => ({}),
    })();

    const gate = deferred<string>();
    const promise = store.$track("manual", gate.promise);

    expect(store.$isActionPending("manual")).toBe(true);
    expect(store.$async.manual.loading).toBe(true);

    gate.resolve("done");
    await expect(promise).resolves.toBe("done");

    expect(store.$async.manual.loading).toBe(false);
    expect(store.$async.manual.runCount).toBe(1);
    expect(store.$loading).toBe(false);
  });

  it("records failures of $track-ed promises", async () => {
    setup();
    const store = defineStore("trackHelperFail", {
      state: () => ({}),
    })();

    await expect(
      store.$track("manual", () => Promise.reject(new Error("tracked"))),
    ).rejects.toThrow("tracked");

    expect(store.$error?.message).toBe("tracked");
    expect(store.$errorInfo?.action).toBe("manual");
    expect(store.$async.manual.error?.message).toBe("tracked");
  });

  it("resolves $waitForIdle once every call finished", async () => {
    setup();
    const gate = deferred();
    const store = defineStore("waitIdle", {
      state: () => ({}),
      actions: {
        async slow() {
          await gate.promise;
        },
      },
    })();

    const promise = store.slow();
    let idle = false;
    const idlePromise = store.$waitForIdle().then(() => {
      idle = true;
    });

    await Promise.resolve();
    expect(idle).toBe(false);

    gate.resolve();
    await promise;
    await idlePromise;

    expect(idle).toBe(true);
    expect(store.$loading).toBe(false);
  });
});
