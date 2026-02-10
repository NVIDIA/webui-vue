import type { AxiosRequestConfig } from "axios";
import Axios from "axios";
import {
  setupCache,
  buildWebStorage,
  buildMemoryStorage,
} from "axios-cache-interceptor";
import type { QueryClient } from "@tanstack/vue-query";
import Cookies from "js-cookie";

/**
 * Axios instance for Orval-generated API clients.
 *
 * This is a standalone instance that mirrors the configuration from
 * src/store/api.js but without the Vue store dependencies (which can't
 * be resolved during Orval's bundling phase).
 *
 * Features:
 * - Cache setup via axios-cache-interceptor
 * - Same default headers as main app
 * - Cancel token support for query cancellation
 *
 * Note: Auth token and response interceptors are handled separately.
 * The X-Auth-Token header should be set after login via setAuthToken().
 */

const axiosInstance = Axios.create({
  withCredentials: true,
});

// Use localStorage in browser, memory storage in Node/SSR/tests
const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";
const cacheStorage = isBrowser
  ? buildWebStorage(localStorage, "webui-vue-orval-cache:")
  : buildMemoryStorage();

// Setup caching (same config as src/store/api.js)
const api = setupCache(axiosInstance, {
  methods: ["get"],
  interpretHeader: false,
  etag: true,
  modifiedSince: false,
  staleIfError: false,
  ttl: 0,
  storage: cacheStorage,
});

api.defaults.headers.common["Accept"] = "application/json";
api.defaults.headers.common["Content-Type"] = "application/json";
api.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";

// Enable persisting X-Auth-Token in a cookie when explicitly requested
// (same condition as src/store/api.js)
const shouldPersistAuthToken =
  import.meta.env.VITE_STORE_SESSION === "true" ||
  import.meta.env.STORE_SESSION === "true";

/**
 * Set the X-Auth-Token header for authenticated requests.
 * Call this after login to enable auth for Orval-generated API calls.
 * Only used when VITE_STORE_SESSION is enabled (non-bmcweb backends).
 */
export const setAuthToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common["X-Auth-Token"] = token;
  } else {
    delete api.defaults.headers.common["X-Auth-Token"];
  }
};

// Initialize auth token from cookie if available (same as src/store/api.js)
// Only for non-bmcweb backends that use X-Auth-Token instead of XSRF cookies
if (shouldPersistAuthToken) {
  const persistedToken = Cookies.get("X-Auth-Token");
  if (persistedToken) {
    api.defaults.headers.common["X-Auth-Token"] = persistedToken;
  }
}

// ---------------------------------------------------------------------------
// Vue Query cache sync — populate the Vue Query cache for every successful
// GET /redfish/* response so that bare get*() calls participate in
// SSE-driven cache invalidation.
// ---------------------------------------------------------------------------

let _queryClient: QueryClient | null = null;

/**
 * Connect the Vue Query client to the Axios instance.
 * Call once during app init (after VueQueryPlugin is installed).
 * This enables the response interceptor to populate the Vue Query cache
 * for all Redfish GET requests, even those made via bare get*() functions.
 */
export const setQueryClient = (client: QueryClient): void => {
  _queryClient = client;
};

/**
 * Derive a Vue Query cache key from a Redfish URL.
 * Strips the /redfish/v1 prefix and query parameters, then splits path segments.
 *
 * Example: "/redfish/v1/TaskService/Tasks/1" -> ["TaskService", "Tasks", "1"]
 */
function deriveQueryKey(url: string): string[] {
  // Strip query parameters
  const pathOnly = url.split("?")[0];
  // Strip /redfish/v1/ prefix, then split into segments
  const stripped = pathOnly.replace(/^\/redfish\/v1\/?/, "/");
  return stripped.split("/").filter(Boolean);
}

// Response interceptor: sync successful GET /redfish/* responses into Vue Query cache
// and redirect to /login on 401 responses.
api.interceptors.response.use(
  (response) => {
    if (
      _queryClient &&
      response.config.method?.toLowerCase() === "get" &&
      response.config.url?.startsWith("/redfish/")
    ) {
      const queryKey = deriveQueryKey(response.config.url);
      _queryClient.setQueryData(queryKey, response.data);
    }
    return response;
  },
  async (error) => {
    const response = error?.response;
    const status = response?.status;

    if (!status) {
      return Promise.reject(error);
    }

    if (status === 401) {
      const isLoginAttempt =
        response.config?.method === "post" &&
        response.config?.url?.endsWith("/SessionService/Sessions");
      if (!isLoginAttempt) {
        const { useAuthStore } = await import("@/stores/auth");
        const authStore = useAuthStore();
        await authStore.logout(true);
      }
    }

    return Promise.reject(error);
  },
);

export const apiInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  const source = Axios.CancelToken.source();

  const promise = api({ ...config, cancelToken: source.token }).then(
    ({ data }) => data,
  );

  // @ts-expect-error - Adding cancel method for query cancellation support
  promise.cancel = () => {
    source.cancel("Query was cancelled");
  };

  return promise;
};

/**
 * Clear axios cache entries matching a URL pattern.
 * Use this when invalidating Vue Query cache to also clear axios ETag cache.
 *
 * @param urlPattern - Regex or string to match against cached URLs.
 *                     If not provided, clears ALL cache entries.
 */
export const clearAxiosCache = async (urlPattern?: string | RegExp): Promise<void> => {
  if (!isBrowser) return;

  const prefix = "webui-vue-orval-cache:";

  if (!urlPattern) {
    // Clear all cache entries
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    return;
  }

  // Clear entries matching the pattern
  const regex = typeof urlPattern === "string" ? new RegExp(urlPattern) : urlPattern;
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix) && regex.test(key)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

/**
 * Clear axios cache for Managers endpoints.
 */
export const clearManagersCache = (): Promise<void> =>
  clearAxiosCache(/\/redfish\/v1\/Managers/);

/**
 * Clear axios cache for Systems endpoints.
 */
export const clearSystemsCache = (): Promise<void> =>
  clearAxiosCache(/\/redfish\/v1\/Systems/);

/**
 * Clear axios cache for ServiceRoot.
 */
export const clearServiceRootCache = (): Promise<void> =>
  clearAxiosCache(/\/redfish\/v1\/?$/);

export default apiInstance;
