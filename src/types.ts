import type { PiniaPluginContext } from "pinia";

export interface AsyncState {
  $loading: boolean;
  $error: Error | null;
  $pendingActions: string[];
  $resetAsyncState: () => void;
}

declare module "pinia" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface PiniaCustomProperties extends AsyncState {}

  export interface DefineStoreOptionsBase<S, Store> {
    asyncState?: boolean;
  }
}

export interface PiniaAsyncStateOptions {
  logErrors?: boolean;
  resetOnAction?: boolean;
}

export type PiniaAsyncStatePlugin = (context: PiniaPluginContext) => void;
