import {
  computed,
  getCurrentScope,
  markRaw,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowRef,
  watch,
} from "vue";
import type { PiniaPlugin, PiniaPluginContext } from "pinia";
import type {
  AsyncActionRegistry,
  AsyncErrorContext,
  AsyncErrorInfo,
  AsyncErrorOrigin,
  AsyncState,
  AsyncStateStoreOptions,
  NormalizeError,
  PiniaAsyncStateOptions,
} from "./types.ts";

/** Internal, mutable version of {@link AsyncActionState}. */
interface MutableActionState {
  loading: boolean;
  error: Error | null;
  pendingCount: number;
  runCount: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
}

interface CallContext {
  action: string;
  generation: number;
  record: MutableActionState;
}

const TAG = "[pinia-async-state]";

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") return json;
  } catch {
    // circular or non-serializable value, fall through to String()
  }
  return String(value);
}

/** Keeps thrown values usable from templates and `instanceof Error` checks. */
const defaultNormalize: NormalizeError = (raw) =>
  raw instanceof Error ? raw : new Error(stringifyUnknown(raw));

/** Prevents Vue from deep-proxying (and thereby cloning away) an Error instance. */
function maybeMarkRaw<T>(value: T): T {
  return typeof value === "object" && value !== null
    ? (markRaw(value as object) as T)
    : value;
}

function createActionState(): MutableActionState {
  return {
    loading: false,
    error: null,
    pendingCount: 0,
    runCount: 0,
    lastRunAt: null,
    lastSuccessAt: null,
  };
}

export function createPiniaAsyncStatePlugin(
  options: PiniaAsyncStateOptions = {},
): PiniaPlugin {
  const {
    logErrors = false,
    resetOnAction = true,
    only,
    exclude = [],
    minLoadingTime = 0,
    normalizeError,
    onError,
  } = options;

  const normalize: NormalizeError = (raw, origin) => {
    if (normalizeError) {
      try {
        const normalized = normalizeError(raw, origin);
        if (normalized instanceof Error) return normalized;
        return defaultNormalize(normalized, origin);
      } catch (handlerError) {
        // eslint-disable-next-line no-console
        console.error(
          `${TAG} normalizeError threw, falling back to the default normalizer:`,
          handlerError,
        );
      }
    }
    return defaultNormalize(raw, origin);
  };

  return function piniaAsyncStatePlugin({
    store,
    options: storeOptions,
  }: PiniaPluginContext): Partial<AsyncState> | void {
    const storeConfig = storeOptions.asyncState as
      | boolean
      | AsyncStateStoreOptions
      | undefined;

    if (storeConfig === false) return;

    const storeConfigObject =
      typeof storeConfig === "object" && storeConfig !== null
        ? storeConfig
        : undefined;

    const trackedOnly = storeConfigObject?.only ?? only;
    const trackedExclude = [...exclude, ...(storeConfigObject?.exclude ?? [])];

    const actions = reactive<Record<string, MutableActionState>>({});
    const readonlyActions = readonly(actions) as AsyncActionRegistry;
    const errorInfo = shallowRef<AsyncErrorInfo | null>(null);
    const flickerHold = ref(false);

    /** Bumped on reset so that calls started before the reset stop mutating state. */
    const generations = new Map<string, number>();

    const pendingActions = computed<string[]>(() => {
      const names: string[] = [];
      for (const name in actions) {
        if (actions[name].pendingCount > 0) names.push(name);
      }
      return names;
    });

    const pendingCount = computed<number>(() => {
      let total = 0;
      for (const name in actions) total += actions[name].pendingCount;
      return total;
    });

    const error = computed<Error | null>(() => errorInfo.value?.error ?? null);

    // --- minLoadingTime (anti-flicker) -------------------------------------
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let loadingStartedAt = 0;

    const clearHold = (): void => {
      if (holdTimer !== undefined) {
        clearTimeout(holdTimer);
        holdTimer = undefined;
      }
      flickerHold.value = false;
    };

    if (minLoadingTime > 0) {
      watch(
        pendingCount,
        (count) => {
          if (count > 0) {
            loadingStartedAt = Date.now();
            clearHold();
            return;
          }
          if (loadingStartedAt === 0) {
            flickerHold.value = false;
            return;
          }
          const remaining = minLoadingTime - (Date.now() - loadingStartedAt);
          loadingStartedAt = 0;
          if (remaining > 0) {
            flickerHold.value = true;
            holdTimer = setTimeout(() => {
              holdTimer = undefined;
              flickerHold.value = false;
            }, remaining);
          } else {
            flickerHold.value = false;
          }
        },
        { flush: "sync" },
      );

      if (getCurrentScope()) {
        onScopeDispose(() => {
          if (holdTimer !== undefined) clearTimeout(holdTimer);
        });
      }
    }

    const loading = computed<boolean>(
      () => pendingCount.value > 0 || flickerHold.value,
    );

    // --- helpers -----------------------------------------------------------
    const shouldTrack = (name: string): boolean => {
      if (name.startsWith("$")) return false;
      if (trackedExclude.includes(name)) return false;
      if (trackedOnly && trackedOnly.length > 0 && !trackedOnly.includes(name)) {
        return false;
      }
      return true;
    };

    const generationOf = (name: string): number => generations.get(name) ?? 0;

    const ensureRecord = (name: string): MutableActionState => {
      if (!actions[name]) actions[name] = createActionState();
      return actions[name] as MutableActionState;
    };

    const startCall = (name: string): CallContext => {
      const record = ensureRecord(name);
      const generation = generationOf(name);
      record.runCount += 1;
      record.pendingCount += 1;
      record.loading = true;
      record.lastRunAt = Date.now();
      if (resetOnAction) {
        record.error = null;
        errorInfo.value = null;
      }
      return { action: name, generation, record };
    };

    const settle = (call: CallContext): void => {
      // A reset happened while this call was in flight: state was already cleared.
      if (generationOf(call.action) !== call.generation) return;
      call.record.pendingCount = Math.max(0, call.record.pendingCount - 1);
      call.record.loading = call.record.pendingCount > 0;
    };

    const handleSuccess = (call: CallContext): void => {
      if (generationOf(call.action) !== call.generation) return;
      call.record.lastSuccessAt = Date.now();
    };

    const handleFailure = (call: CallContext, raw: unknown): void => {
      const origin: AsyncErrorOrigin = {
        storeId: store.$id,
        action: call.action,
      };
      const normalized = normalize(raw, origin);

      if (generationOf(call.action) === call.generation) {
        call.record.error = maybeMarkRaw(normalized);
        errorInfo.value = {
          storeId: store.$id,
          action: call.action,
          error: normalized,
          raw,
          at: Date.now(),
        };
      }

      if (logErrors) {
        // eslint-disable-next-line no-console
        console.error(
          `${TAG} Action "${call.action}" in store "${store.$id}" failed:`,
          raw,
        );
      }

      if (onError) {
        const context: AsyncErrorContext = {
          storeId: store.$id,
          action: call.action,
          error: normalized,
          raw,
        };
        try {
          onError(context);
        } catch (handlerError) {
          // eslint-disable-next-line no-console
          console.error(`${TAG} onError handler threw:`, handlerError);
        }
      }
    };

    // --- store level API ---------------------------------------------------
    const clearError = (): void => {
      errorInfo.value = null;
      for (const name in actions) actions[name].error = null;
    };

    const resetAction = (name: string): void => {
      generations.set(name, generationOf(name) + 1);
      const record = actions[name];
      if (!record) {
        if (errorInfo.value?.action === name) errorInfo.value = null;
        return;
      }
      record.loading = false;
      record.error = null;
      record.pendingCount = 0;
      record.runCount = 0;
      record.lastRunAt = null;
      record.lastSuccessAt = null;
      if (errorInfo.value?.action === name) errorInfo.value = null;
    };

    const resetAsyncState = (): void => {
      for (const name in actions) resetAction(name);
      errorInfo.value = null;
      clearHold();
      loadingStartedAt = 0;
    };

    const waitForIdle = (): Promise<void> => {
      if (pendingCount.value === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const stop = watch(
          pendingCount,
          (count) => {
            if (count === 0) {
              stop();
              resolve();
            }
          },
          { flush: "sync" },
        );
      });
    };

    const track = <T>(
      name: string,
      work: Promise<T> | (() => Promise<T>),
    ): Promise<T> => {
      if (!shouldTrack(name)) {
        return typeof work === "function" ? Promise.resolve().then(work) : work;
      }

      const call = startCall(name);
      let pending: Promise<T>;
      try {
        pending =
          typeof work === "function" ? Promise.resolve(work()) : work;
      } catch (raw) {
        settle(call);
        handleFailure(call, raw);
        return Promise.reject(raw);
      }

      return pending.then(
        (value) => {
          settle(call);
          handleSuccess(call);
          return value;
        },
        (raw: unknown) => {
          settle(call);
          handleFailure(call, raw);
          return Promise.reject(raw);
        },
      );
    };

    // --- action subscription ----------------------------------------------
    store.$onAction(({ name, after, onError: onActionError }) => {
      if (!shouldTrack(name)) return;

      const call = startCall(name);

      after(() => {
        settle(call);
        handleSuccess(call);
      });

      onActionError((rawError) => {
        settle(call);
        handleFailure(call, rawError);
      });
    });

    return {
      $loading: loading,
      $error: error,
      $errorInfo: errorInfo,
      $pendingActions: pendingActions,
      $pendingCount: pendingCount,
      $async: readonlyActions,
      $isActionPending: (action: string) =>
        (actions[action]?.pendingCount ?? 0) > 0,
      $clearError: clearError,
      $resetAction: resetAction,
      $resetAsyncState: resetAsyncState,
      $waitForIdle: waitForIdle,
      $track: track,
    } as unknown as Partial<AsyncState>;
  };
}
