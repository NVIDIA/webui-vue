/**
 * Generic Redfish collection fetcher with $expand query support.
 *
 * Adapted from nvbmc pattern - tries $expand first for efficient single-call
 * fetching, falls back to individual member fetches if not supported.
 */
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import type { MaybeRef } from 'vue';
import { computed, unref } from 'vue';

import { apiInstance } from '@/api/mutator/axios-instance';
import type { ServiceRoot } from '@/api/model/ServiceRoot';

/**
 * Smart retry function that doesn't retry on 4xx client errors.
 * 4xx errors (like 404 Not Found) won't succeed on retry.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  // Don't retry on 4xx client errors
  if (status && status >= 400 && status < 500) {
    return false;
  }
  // Retry up to 3 times for other errors (network issues, 5xx server errors)
  return failureCount < 3;
}

/**
 * When an $expand request fails, fall back to listing + per-member GET unless
 * the error is auth/forbidden (retrying without expand won't help).
 */
export function shouldFallbackFromExpand(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === undefined) return false;
  if (status === 401 || status === 403) return false;
  if (status === 400 || status === 501) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

/**
 * Redfish OData query parameters (Redfish-first naming)
 */
export interface RedfishQueryParameters {
  $expand?:
    | string
    | {
        $levels?: number;
        $noLinks?: boolean;
        $expandAll?: boolean;
        $links?: boolean;
      };
  $filter?: string;
  $select?: string | string[];
  $top?: number;
  $skip?: number;
  only?: boolean;
  excerpt?: number;
  /**
   * Force manual expansion by fetching each member individually.
   * Use this for BMCs that partially implement $expand (e.g., only expand first item).
   */
  forceManualExpand?: boolean;
}

/**
 * Build OData query string from RedfishQueryParameters
 */
export function buildQuery(
  path: string,
  params?: RedfishQueryParameters,
): string {
  if (!params) return path;

  const pairs: string[] = [];

  if (params.$expand) {
    if (typeof params.$expand === 'string') {
      // Do not encode $ directives inside the value (e.g., .($levels=2), *)
      pairs.push(`$expand=${params.$expand}`);
    } else {
      const expandParts: string[] = [];
      if (params.$expand.$levels !== undefined)
        expandParts.push(`$levels=${params.$expand.$levels}`);
      if (params.$expand.$noLinks !== undefined)
        expandParts.push(`$noLinks=${params.$expand.$noLinks}`);
      if (params.$expand.$expandAll !== undefined)
        expandParts.push(`$expandAll=${params.$expand.$expandAll}`);
      if (params.$expand.$links !== undefined)
        expandParts.push(`$links=${params.$expand.$links}`);
      // Build .(options) without encoding the $ directives; use ';' between options per OData
      const opts = expandParts.join(';');
      pairs.push(`$expand=.(${opts})`);
    }
  }

  if (params.$filter) pairs.push(`$filter=${encodeURIComponent(params.$filter)}`);

  if (params.$select) {
    const sel = Array.isArray(params.$select)
      ? params.$select.join(',')
      : params.$select;
    pairs.push(`$select=${encodeURIComponent(sel)}`);
  }

  if (params.$top !== undefined)
    pairs.push(`$top=${encodeURIComponent(String(params.$top))}`);
  if (params.$skip !== undefined)
    pairs.push(`$skip=${encodeURIComponent(String(params.$skip))}`);
  if (params.only) pairs.push('only=');
  if (params.excerpt !== undefined)
    pairs.push(`excerpt=${encodeURIComponent(String(params.excerpt))}`);

  const qs = pairs.join('&');
  return qs ? `${path}?${qs}` : path;
}

/**
 * Normalize query params for stable Vue Query keys.
 * - Ensures consistent key presence/order.
 * - Normalizes `$select` arrays into a stable, sorted list.
 * - Normalizes structured `$expand` into a stable object with fixed keys.
 */
function normalizeRedfishQueryParameters(
  params?: RedfishQueryParameters,
): Readonly<RedfishQueryParameters> | undefined {
  if (!params) return undefined;

  const normalizedSelect =
    params.$select === undefined
      ? undefined
      : Array.isArray(params.$select)
        ? [...params.$select].sort()
        : params.$select;

  const normalizedExpand =
    params.$expand === undefined
      ? undefined
      : typeof params.$expand === 'string'
        ? params.$expand
        : {
            $levels: params.$expand.$levels,
            $noLinks: params.$expand.$noLinks,
            $expandAll: params.$expand.$expandAll,
            $links: params.$expand.$links,
          };

  return Object.freeze({
    $expand: normalizedExpand,
    $filter: params.$filter,
    $select: normalizedSelect,
    $top: params.$top,
    $skip: params.$skip,
    only: params.only,
    excerpt: params.excerpt,
    forceManualExpand: params.forceManualExpand,
  });
}

/**
 * Fetch collection members individually when $expand is not supported.
 * Takes a collection listing with @odata.id refs and fetches each member.
 */
async function fetchMembersIndividually<T>(listing: {
  Members?: Array<{ '@odata.id'?: string } | T>;
  [key: string]: unknown;
}): Promise<{ Members: T[]; [key: string]: unknown }> {
  const refs = listing?.Members ?? [];
  if (!Array.isArray(refs) || refs.length === 0) {
    return { ...listing, Members: [] as T[] };
  }

  const fetched = await Promise.all(
    refs.map(async (r) => {
      const odataId = (r as { '@odata.id'?: string })?.['@odata.id'];
      if (odataId) {
        return apiInstance<T>({ url: odataId, method: 'GET' });
      }
      return r as T;
    }),
  );

  return {
    ...listing,
    Members: fetched,
    'Members@odata.count': refs.length,
  };
}

/**
 * Get ServiceRoot with caching
 */
async function getServiceRoot(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<ServiceRoot | null> {
  // Use a dedicated "static" cache key so other parts of the app can
  // refresh ServiceRoot without affecting collection-fetch capability checks.
  // The ServiceRoot capabilities are treated as load-once here.
  const cacheKey = ['ServiceRoot', 'static'] as const;

  // Check if ServiceRoot is already cached
  const cached = queryClient.getQueryData<ServiceRoot>(cacheKey);

  if (cached) return cached;

  // Fetch ServiceRoot and cache it
  try {
    return await queryClient.fetchQuery({
      queryKey: cacheKey,
      queryFn: () =>
        apiInstance<ServiceRoot>({ url: '/redfish/v1/', method: 'GET' }),
      staleTime: Infinity,
      gcTime: Infinity,
    });
  } catch {
    return null;
  }
}

/**
 * Get the maximum $expand levels supported by the BMC.
 * Returns 0 if $expand is not supported.
 */
async function getExpandMaxLevels(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<number> {
  const serviceRoot = await getServiceRoot(queryClient);
  return serviceRoot?.ProtocolFeaturesSupported?.ExpandQuery?.MaxLevels ?? 0;
}

/**
 * Check if the BMC supports $expand based on ServiceRoot ProtocolFeaturesSupported.
 */
async function checkExpandSupport(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<boolean> {
  return (await getExpandMaxLevels(queryClient)) > 0;
}

/**
 * Check if the BMC supports $filter based on ServiceRoot ProtocolFeaturesSupported.
 */
export async function checkFilterSupport(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<boolean> {
  const features = await getProtocolFeatures(queryClient);
  return features?.FilterQuery === true;
}

/**
 * Get ProtocolFeaturesSupported from ServiceRoot.
 * Exported for use in other composables.
 */
export async function getProtocolFeatures(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<ServiceRoot['ProtocolFeaturesSupported'] | undefined> {
  const serviceRoot = await getServiceRoot(queryClient);
  return serviceRoot?.ProtocolFeaturesSupported;
}

/**
 * Smart collection fetcher: tries $expand first, falls back to individual fetches.
 *
 * @param path - Redfish collection path (e.g., /redfish/v1/Chassis/chassis/Sensors)
 * @param params - Optional OData query parameters
 * @param queryClient - Vue Query client for checking $expand support
 * @returns Collection with embedded Members
 */
export async function fetchRedfishCollection<T>(
  path: string,
  params: RedfishQueryParameters | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<{ Members: T[]; [key: string]: unknown }> {
  const supportsExpand = await checkExpandSupport(queryClient);

  // Try $expand if supported AND forceManualExpand is not set
  if (supportsExpand && !params?.forceManualExpand) {
    try {
      // Try $expand - use provided expand or default to '.'
      const url = buildQuery(path, { ...params, $expand: params?.$expand ?? '.' });
      const expanded = await apiInstance<{ Members?: T[]; [key: string]: unknown }>({
        url,
        method: 'GET',
      });

      const members = expanded?.Members;

      // If Members is an array, the $expand request succeeded
      // Empty array is valid - the collection has no members
      // Only fall through if members are NOT expanded (only have @odata.id refs)
      if (Array.isArray(members)) {
        // Empty array = valid, return it
        if (members.length === 0) {
          return expanded as { Members: T[]; [key: string]: unknown };
        }

        // Check if members are expanded (have more than just @odata.id)
        const hasExpandedMembers = members.some(
          (m) => m && typeof m === 'object' && Object.keys(m).length > 2,
        );

        if (hasExpandedMembers) {
          return expanded as { Members: T[]; [key: string]: unknown };
        }
        // If members only have @odata.id, $expand wasn't applied - fall through
      }
    } catch (e: unknown) {
      if (!shouldFallbackFromExpand(e)) {
        throw e;
      }
    }
  }

  // Fallback: list collection then fetch each member individually
  const paramsWithoutExpand = params ? { ...params, $expand: undefined } : undefined;
  const listing = await apiInstance<{
    Members?: Array<{ '@odata.id'?: string }>;
    [key: string]: unknown;
  }>({
    url: buildQuery(path, paramsWithoutExpand),
    method: 'GET',
  });

  return await fetchMembersIndividually<T>(listing);
}

/**
 * Vue Query hook for fetching any Redfish collection with $expand optimization.
 *
 * @param path - Redfish collection path (can be a ref for reactivity)
 * @param params - Optional OData query parameters
 * @returns Vue Query result with collection data
 */
export function useRedfishCollection<T>(
  path: MaybeRef<string>,
  params?: RedfishQueryParameters,
) {
  const pathValue = computed(() => unref(path));
  const queryClient = useQueryClient();
  const normalizedParams = normalizeRedfishQueryParameters(params);

  return useQuery({
    queryKey: computed(
      () => ['redfish-collection', pathValue.value, normalizedParams] as const,
    ),
    queryFn: () =>
      fetchRedfishCollection<T>(pathValue.value, params, queryClient),
    enabled: computed(() => !!pathValue.value),
    retry: shouldRetry,
    staleTime: 30000, // 30s - prevents duplicate fetches across components
  });
}

// ============================================================================
// Generic Single Sub-Resource Fetcher
// ============================================================================

/**
 * Fetch a single sub-resource from a parent Redfish resource by following
 * the link advertised in the parent object.
 *
 * Optimization strategy:
 * 1. If $expand is supported, fetch the parent with `$expand=*` so the
 *    sub-resource is returned inline — a single request instead of two.
 * 2. If $expand is not supported or the expanded response doesn't contain
 *    the sub-resource data, fall back to link navigation: read the parent,
 *    find the sub-resource `@odata.id` link, and fetch that URI.
 *
 * Example:
 *   const metrics = await fetchSubResource<EnvironmentMetrics>(
 *     "/redfish/v1/Systems/HGX_Baseboard_0/Processors/CPU_0",
 *     "EnvironmentMetrics",
 *     queryClient,
 *   );
 *
 * @param resourcePath - URI of the parent resource
 * @param subResource - Property name of the sub-resource (e.g., "EnvironmentMetrics")
 * @param queryClient - Vue Query client (for checking $expand support)
 * @returns The fetched sub-resource, or null if the link is not present
 */
export async function fetchSubResource<T>(
  resourcePath: string,
  subResource: string,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<T | null> {
  const supportsExpand = await checkExpandSupport(queryClient);

  // Strategy 1: Use $expand=* to get the sub-resource inline in one request
  if (supportsExpand) {
    try {
      const expanded = await apiInstance<Record<string, unknown>>({
        url: `${resourcePath}?$expand=*`,
        method: 'GET',
      });

      // Check if the sub-resource was expanded inline (has more than just @odata.id)
      const subResourceData = expanded?.[subResource] as
        | Record<string, unknown>
        | undefined;
      if (
        subResourceData &&
        typeof subResourceData === 'object' &&
        Object.keys(subResourceData).length > 1
      ) {
        return subResourceData as T;
      }
      // $expand returned but sub-resource wasn't expanded — fall through
    } catch (e: unknown) {
      if (!shouldFallbackFromExpand(e)) {
        throw e;
      }
    }
  }

  // Strategy 2: Fetch the parent resource, follow the sub-resource link
  const parent = await apiInstance<Record<string, unknown>>({
    url: resourcePath,
    method: 'GET',
  });

  // Extract the sub-resource @odata.id link
  const subResourceRef = parent?.[subResource] as
    | { '@odata.id'?: string }
    | undefined;
  const subResourceUri = subResourceRef?.['@odata.id'];

  if (!subResourceUri) {
    return null;
  }

  // Fetch the sub-resource using the discovered URI
  return apiInstance<T>({ url: subResourceUri, method: 'GET' });
}

/**
 * Vue Query hook for fetching a single sub-resource from a parent Redfish
 * resource by following the link advertised in the parent object.
 *
 * Example: Fetch EnvironmentMetrics from a Processor
 *   useSubResource<EnvironmentMetrics>(processorUri, "EnvironmentMetrics")
 *
 * @param resourcePath - URI of the parent resource (can be a ref for reactivity)
 * @param subResource - Property name of the sub-resource (e.g., "EnvironmentMetrics")
 * @returns Vue Query result with the sub-resource data
 */
export function useSubResource<T>(
  resourcePath: MaybeRef<string | undefined | null>,
  subResource: string,
) {
  const pathValue = computed(() => unref(resourcePath));
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: computed(
      () => ['subResource', pathValue.value, subResource] as const,
    ),
    queryFn: () =>
      fetchSubResource<T>(pathValue.value!, subResource, queryClient),
    enabled: computed(() => !!pathValue.value),
    retry: shouldRetry,
    staleTime: 30000,
  });
}

// ============================================================================
// Generic Sub-Resource Collection Fetcher
// ============================================================================

/**
 * Extract leaf items from deeply-expanded collection members by walking
 * through a chain of nested property names.
 *
 * E.g., for nestedProperties = ['EnvironmentMetrics'] and a Processor member
 * that has EnvironmentMetrics expanded inline, this extracts the
 * EnvironmentMetrics object from each member.
 *
 * Only returns items that are actually expanded (more than just @odata.id).
 */
function extractNestedItems<T>(
  members: Record<string, unknown>[],
  nestedProperties: string[],
): T[] {
  return members
    .map((member) => {
      let current: unknown = member;
      for (const prop of nestedProperties) {
        if (!current || typeof current !== 'object') return null;
        current = (current as Record<string, unknown>)[prop];
      }
      // Verify the leaf is actually expanded (not just an @odata.id ref)
      if (
        current &&
        typeof current === 'object' &&
        Object.keys(current as object).length > 1
      ) {
        return current as T;
      }
      return null;
    })
    .filter((item): item is T => item !== null);
}

/**
 * Fetch leaf items by following @odata.id links through a chain of nested
 * property names. Used as fallback when deep $expand is not available.
 *
 * For each member, walks through nestedProperties one at a time:
 *   member -> member[prop0]['@odata.id'] -> fetch -> result[prop1]['@odata.id'] -> fetch -> ...
 */
async function fetchNestedItems<T>(
  members: Record<string, unknown>[],
  nestedProperties: string[],
): Promise<T[]> {
  let currentResources: Record<string, unknown>[] = members;

  for (const prop of nestedProperties) {
    const nextResources = await Promise.all(
      currentResources.map(async (resource) => {
        const ref = resource?.[prop] as { '@odata.id'?: string } | undefined;
        const uri = ref?.['@odata.id'];
        if (!uri) return null;
        try {
          return await apiInstance<Record<string, unknown>>({
            url: uri,
            method: 'GET',
          });
        } catch {
          return null;
        }
      }),
    );

    currentResources = nextResources.filter(
      (r): r is Record<string, unknown> => r !== null,
    );
  }

  return currentResources as unknown as T[];
}

/**
 * Fetch all URIs for a sub-resource from all members of a collection.
 *
 * Optimization strategy:
 * 1. If SelectQuery supported: Use $select=Members/{subResource}
 *    This returns only members that have the sub-resource, then append /{subResource}
 * 2. If SelectQuery not supported: Fall back to fetching each member individually
 *    to check if they have the sub-resource link
 *
 * @param collectionPath - Parent collection path (e.g., "/redfish/v1/Chassis")
 * @param subResource - Name of the sub-resource property (e.g., "Sensors")
 * @param queryClient - Vue Query client
 * @returns Array of sub-resource URIs (e.g., ["/redfish/v1/Chassis/BMC_0/Sensors", ...])
 */
export async function fetchAllSubResourceUris(
  collectionPath: string,
  subResource: string,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<string[]> {
  const features = await getProtocolFeatures(queryClient);
  const supportsSelect = features?.SelectQuery === true;

  // Strategy 1: Use $select=Members/{subResource} to get only members with the sub-resource
  if (supportsSelect) {
    try {
      const result = await apiInstance<{
        Members?: Array<{ '@odata.id'?: string }>;
      }>({
        url: `${collectionPath}?$select=Members/${subResource}`,
        method: 'GET',
      });

      // $select filters to only members that have the sub-resource
      const subResourceUris = result?.Members
        ?.map((m) => m['@odata.id'])
        .filter((uri): uri is string => !!uri)
        .map((memberUri) => `${memberUri}/${subResource}`) ?? [];

      if (subResourceUris.length > 0) {
        return subResourceUris;
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Strategy 2: Get collection, then fetch each member to get sub-resource links
  const collection = await apiInstance<{
    Members?: Array<{ '@odata.id'?: string }>;
  }>({
    url: collectionPath,
    method: 'GET',
  });

  const memberUris = collection?.Members
    ?.map((m) => m['@odata.id'])
    .filter((uri): uri is string => !!uri) ?? [];

  if (memberUris.length === 0) return [];

  // Fetch each member to check for sub-resource link
  const results = await Promise.all(
    memberUris.map(async (uri) => {
      try {
        const member = await apiInstance<Record<string, unknown>>({
          url: uri,
          method: 'GET',
        });
        const subResourceLink = member?.[subResource] as { '@odata.id'?: string } | undefined;
        return subResourceLink?.['@odata.id'];
      } catch {
        return undefined;
      }
    }),
  );

  return results.filter((uri): uri is string => !!uri);
}

/**
 * Fetch all items from a sub-resource across all members of a parent collection.
 *
 * Supports both simple and nested sub-resource paths:
 *
 *   Simple:  fetchAllSubResources<Sensor>("/redfish/v1/Chassis", "Sensors", qc)
 *     → Discovers Sensors collections on each Chassis, fetches all Sensor members.
 *
 *   Nested:  fetchAllSubResources<EnvironmentMetrics>(
 *              "/redfish/v1/Systems", "Processors/EnvironmentMetrics", qc)
 *     → Discovers Processors collections on each System, then fetches the
 *       EnvironmentMetrics sub-resource from each Processor member.
 *
 * Optimization strategy for nested paths:
 *   If the BMC reports MaxLevels >= depth of the path, uses a single deep
 *   $expand (e.g., `$expand=.($levels=2)`) to get everything in one call per
 *   collection. Falls back to individual link-navigation fetches otherwise.
 *
 * @param collectionPath - Parent collection path (e.g., "/redfish/v1/Chassis")
 * @param subResource - Sub-resource property path (e.g., "Sensors" or "Processors/EnvironmentMetrics")
 * @param queryClient - Vue Query client
 * @returns Flat array of all leaf sub-resource items
 */
export async function fetchAllSubResources<
  T extends { Name?: string; Id?: string; '@odata.id'?: string },
>(
  collectionPath: string,
  subResource: string,
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey?: readonly unknown[],
): Promise<T[]> {
  // Parse nested sub-resource path
  const segments = subResource.split('/');
  const collectionProperty = segments[0]; // e.g., 'Processors'
  const nestedProperties = segments.slice(1); // e.g., ['EnvironmentMetrics']
  const levelsNeeded = segments.length; // e.g., 2

  const maxLevels = await getExpandMaxLevels(queryClient);

  function mergeInto(existing: T[], incoming: T[]): T[] {
    if (incoming.length === 0) return existing;

    const seen = new Set<string>();
    const merged: T[] = [];

    // Seed with existing first, deduping by @odata.id where possible
    for (const item of existing) {
      const id = item['@odata.id'];
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(item);
    }

    // Append incoming, deduping by @odata.id where possible
    for (const item of incoming) {
      const id = item['@odata.id'];
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(item);
    }

    return merged;
  }

  // Step 1: Get all collection URIs for the first segment
  const collectionUris = await fetchAllSubResourceUris(
    collectionPath,
    collectionProperty,
    queryClient,
  );

  if (collectionUris.length === 0) return [];

  // Seed cache with existing data so the UI can render while fetching
  if (queryKey) {
    const existing = queryClient.getQueryData<T[]>(queryKey) ?? [];
    queryClient.setQueryData(queryKey, existing);
  }

  // Choose $expand depth: use deep expand if supported for nested paths,
  // otherwise expand one level (collection Members only).
  const canDeepExpand =
    nestedProperties.length > 0 && maxLevels >= levelsNeeded;
  const expandParam = canDeepExpand ? `.($levels=${levelsNeeded})` : '.';

  // Step 2: Fetch all collections in parallel.
  // As each resolves, push partial results into the cache so the UI updates
  // incrementally (rather than waiting for all requests to finish).
  const results = await Promise.all(
    collectionUris.map(async (uri) => {
      try {
        const collection = await fetchRedfishCollection<
          Record<string, unknown>
        >(uri, { $expand: expandParam }, queryClient);
        const rawMembers = (collection.Members ?? []) as Record<
          string,
          unknown
        >[];

        let items: T[];

        if (nestedProperties.length === 0) {
          // Simple case: Members ARE the items
          items = rawMembers as unknown as T[];
        } else if (canDeepExpand) {
          // Deep expand: extract leaf items from expanded members
          items = extractNestedItems<T>(rawMembers, nestedProperties);

          // If extraction found nothing but we have members, the expand
          // didn't go deep enough — fall back to individual fetches
          if (items.length === 0 && rawMembers.length > 0) {
            items = await fetchNestedItems<T>(rawMembers, nestedProperties);
          }
        } else {
          // No deep expand: follow links individually
          items = await fetchNestedItems<T>(rawMembers, nestedProperties);
        }

        if (queryKey) {
          queryClient.setQueryData<T[]>(queryKey, (old) =>
            mergeInto(old ?? [], items),
          );
        }

        return { uri, Members: items, error: undefined as unknown };
      } catch (error: unknown) {
        return { uri, Members: [] as T[], error };
      }
    }),
  );

  const items = mergeInto([], results.flatMap((r) => r.Members));

  // If every sub-resource fetch failed and we ended up with no data, surface an error
  // instead of misleadingly returning an empty array.
  const failed = results.filter((r) => r.error !== undefined);
  if (items.length === 0 && failed.length > 0) {
    const error = new Error(
      `Failed to fetch ${subResource} (${failed.length}/${results.length} requests failed).`,
    );
    (error as { cause?: unknown }).cause = failed[0]?.error;
    throw error;
  }

  return items;
}

/**
 * Vue Query hook for fetching all items from a sub-resource across all members
 * of a parent collection.
 *
 * Example: Fetch all Sensors from all Chassis
 *   useAllSubResources<Sensor>("/redfish/v1/Chassis", "Sensors")
 *
 * @param collectionPath - Parent collection path (e.g., "/redfish/v1/Chassis")
 * @param subResource - Name of the sub-resource property (e.g., "Sensors")
 * @returns Vue Query result with flat array of all sub-resource items
 */
export function useAllSubResources<
  T extends { Name?: string; Id?: string; '@odata.id'?: string },
>(
  collectionPath: string,
  subResource: string,
) {
  const queryClient = useQueryClient();
  const queryKey = ['allSubResources', collectionPath, subResource] as const;

  return useQuery({
    queryKey,
    queryFn: () =>
      fetchAllSubResources<T>(collectionPath, subResource, queryClient, queryKey),
    retry: shouldRetry,
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });
}
