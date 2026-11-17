import { ref, computed } from "vue";
import type { PiniaPluginContext } from "pinia";
import type { PiniaAsyncStateOptions } from "./types.ts";

export function createPiniaAsyncStatePlugin(
  options: PiniaAsyncStateOptions = {},
) {
  const { logErrors = false, resetOnAction = true } = options;

  return function piniaAsyncStatePlugin({
    store,
    options: storeOptions,
  }: PiniaPluginContext) {
    if (storeOptions.asyncState === false) return;

    const pendingActions = ref<string[]>([]);
    const error = ref<Error | null>(null);
    const loading = computed(() => pendingActions.value.length > 0);

    // Pinia در زمان اجرا ref را unwrap می‌کند، پس cast امن است
    store.$loading = loading as unknown as boolean;
    store.$error = error as unknown as Error | null;
    store.$pendingActions = pendingActions as unknown as string[];

    store.$onAction(({ name, after, onError }) => {
      if (resetOnAction) {
        error.value = null;
      }

      pendingActions.value.push(name);

      after(() => {
        removePending(name);
      });

      onError((err) => {
        removePending(name);
        const normalizedError =
          err instanceof Error ? err : new Error(String(err));
        error.value = normalizedError;
        if (logErrors) {
          // eslint-disable-next-line no-console
          console.error(`[pinia-async-state] Action "${name}" failed:`, err);
        }
      });
    });

    function removePending(name: string) {
      const idx = pendingActions.value.indexOf(name);
      if (idx !== -1) pendingActions.value.splice(idx, 1);
    }

    store.$resetAsyncState = () => {
      pendingActions.value = [];
      error.value = null;
    };
  };
}
