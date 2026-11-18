import type { PiniaPlugin } from "pinia";

/**
 * Reactive state of a single tracked action.
 */
export interface AsyncActionState {
  /** `true` while at least one call of this action is in flight. */
  readonly loading: boolean;
  /** Last error thrown by this action (cleared by `resetOnAction` / `$resetAction`). */
  readonly error: Error | null;
  /** Number of in-flight calls of this action (a re-entrant action can be > 1). */
  readonly pendingCount: number;
  /** How many times this action has been called in total. */
  readonly runCount: number;
  /** Timestamp (ms) of the last call, or `null` if it never ran. */
  readonly lastRunAt: number | null;
  /** Timestamp (ms) of the last successful call, or `null`. */
  readonly lastSuccessAt: number | null;
}

/** Map of action name -> its async state. Read-only from the outside. */
export type AsyncActionRegistry = Readonly<Record<string, AsyncActionState>>;

/** Identifies where an error came from. */
export interface AsyncErrorOrigin {
  storeId: string;
  action: string;
}

/** Full context passed to the `onError` hook. */
export interface AsyncErrorContext extends AsyncErrorOrigin {
  error: Error;
  raw: unknown;
}

/** What `store.$errorInfo` holds. */
export interface AsyncErrorInfo extends AsyncErrorContext {
  at: number;
}

/** Turns whatever an action threw into an `Error`. */
export type NormalizeError = (raw: unknown, origin: AsyncErrorOrigin) => Error;

/** Global error hook. */
export type OnAsyncError = (context: AsyncErrorContext) => void;

/** Every property the plugin injects into a store. */
export interface AsyncState {
  /** `true` while any tracked action (or `$track` call) is pending. */
  $loading: boolean;
  /** Last error of the store, or `null`. */
  $error: Error | null;
  /** Last error plus where it came from. */
  $errorInfo: AsyncErrorInfo | null;
  /** Unique names of the currently pending actions. */
  $pendingActions: string[];
  /** Total number of in-flight calls (a re-entrant action counts more than once). */
  $pendingCount: number;
  /** Per-action state: `store.$async.fetchUsers.loading`. */
  $async: AsyncActionRegistry;
  /** `true` if the given action is currently running. */
  $isActionPending: (action: string) => boolean;
  /** Clears `$error`, `$errorInfo` and every per-action error. */
  $clearError: () => void;
  /** Resets loading/error/timestamps for one action. */
  $resetAction: (action: string) => void;
  /** Resets loading/error/timestamps for the whole store. */
  $resetAsyncState: () => void;
  /** Resolves as soon as nothing is pending anymore. */
  $waitForIdle: () => Promise<void>;
  /** Tracks any promise (or promise factory) as if it were an action. */
  $track: <T>(
    action: string,
    work: Promise<T> | (() => Promise<T>),
  ) => Promise<T>;
}

/** Per-store configuration of the plugin. */
export interface AsyncStateStoreOptions {
  /** Only track these actions (overrides the global option). */
  only?: string[];
  /** Never track these actions (merged with the global option). */
  exclude?: string[];
}

export interface PiniaAsyncStateOptions {
  /** Log every failed action to `console.error`. Default: `false`. */
  logErrors?: boolean;
  /** Clear `$error` / the action error when an action starts. Default: `true`. */
  resetOnAction?: boolean;
  /** Only track these action names (all actions when omitted). */
  only?: string[];
  /** Ignore these action names. */
  exclude?: string[];
  /** Minimum time (ms) `$loading` stays `true` to avoid spinner flicker. Default: `0`. */
  minLoadingTime?: number;
  /** Convert non-`Error` throwables into `Error` instances. */
  normalizeError?: NormalizeError;
  /** Called for every failed action — handy for toasts / Sentry / logs. */
  onError?: OnAsyncError;
}

export type PiniaAsyncStatePlugin = PiniaPlugin;

declare module "pinia" {
  /**
   * The injected properties are typed as required because TypeScript cannot
   * express "present unless the store opted out". Stores created with
   * `asyncState: false` do not have them at runtime — cast those to
   * `Omit<typeof store, keyof AsyncState>` if you need the types to match.
   */
  export interface PiniaCustomProperties extends AsyncState {}

  export interface DefineStoreOptionsBase<S, Store> {
    asyncState?: boolean | AsyncStateStoreOptions;
  }
}
