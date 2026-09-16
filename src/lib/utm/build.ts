import { STANDARD_UTM_KEYS, type UtmBuildOptions } from './types.ts';

/**
 * Safely encodes a parameter key or value according to URL standard,
 * ensuring spaces become %20 (rather than +) and special characters
 * (&, =, ?, +, #, %) are escaped.
 */
export function encodeParamComponent(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Builds a final URL with encoded UTM parameters and optional custom query parameters.
 *
 * Requirements:
 * 1. Spaces in UTM values encoded as %20 (never +).
 * 2. Special characters (&, =, ?, +, #, %) safely encoded.
 * 3. Existing non-UTM query parameters are fully preserved in their original order.
 * 4. Existing UTM parameters in baseUrl are replaced by current builder values rather than duplicated.
 * 5. Fragments (#section) are always preserved and placed strictly after the query string.
 * 6. Protocol-less destinations (e.g. example.com/page) preserve their lack of protocol deterministically.
 */
export function buildUtmUrl(options: UtmBuildOptions): string {
  const { baseUrl, params, customParams, preserveExistingParams = true, lowercaseParams = false } = options;
  const trimmedBase = baseUrl.trim();

  if (!trimmedBase) {
    return '';
  }

  // 1. Separate fragment (#...) first so it never interferes with query string parsing
  let baseWithoutFragment = trimmedBase;
  let fragment = '';
  const hashIdx = trimmedBase.indexOf('#');
  if (hashIdx !== -1) {
    baseWithoutFragment = trimmedBase.slice(0, hashIdx);
    fragment = trimmedBase.slice(hashIdx); // includes '#'
  }

  // 2. Separate existing query string (?...)
  let urlPath = baseWithoutFragment;
  let rawQuery = '';
  const qIdx = baseWithoutFragment.indexOf('?');
  if (qIdx !== -1) {
    urlPath = baseWithoutFragment.slice(0, qIdx);
    rawQuery = baseWithoutFragment.slice(qIdx + 1);
  }

  // 3. Extract existing query parameters into an ordered list of [key, value] pairs
  const existingParams: Array<{ key: string; value: string }> = [];
  if (preserveExistingParams && rawQuery.trim()) {
    const pairs = rawQuery.split('&');
    for (const pair of pairs) {
      if (!pair) continue;
      const eqIdx = pair.indexOf('=');
      const rawK = eqIdx !== -1 ? pair.slice(0, eqIdx) : pair;
      const rawV = eqIdx !== -1 ? pair.slice(eqIdx + 1) : '';
      try {
        const decodedKey = decodeURIComponent(rawK.replace(/\+/g, '%20'));
        const decodedVal = decodeURIComponent(rawV.replace(/\+/g, '%20'));
        existingParams.push({ key: decodedKey, value: decodedVal });
      } catch {
        existingParams.push({ key: rawK, value: rawV });
      }
    }
  }

  // Set of lowercase standard UTM keys for replacement checking
  const standardKeySet = new Set<string>(STANDARD_UTM_KEYS.map((k) => k.toLowerCase()));

  // 4. Map of incoming standard UTMs
  const incomingUtms = new Map<string, string>();
  for (const key of STANDARD_UTM_KEYS) {
    const rawVal = params[key];
    if (rawVal !== undefined && rawVal !== null && rawVal.trim() !== '') {
      const val = lowercaseParams ? rawVal.trim().toLowerCase() : rawVal.trim();
      incomingUtms.set(key.toLowerCase(), val);
    }
  }

  // Map of incoming custom parameters
  const incomingCustom = new Map<string, string>();
  if (customParams) {
    for (const [k, rawVal] of Object.entries(customParams)) {
      if (rawVal !== undefined && rawVal !== null && rawVal.trim() !== '') {
        const val = lowercaseParams ? rawVal.trim().toLowerCase() : rawVal.trim();
        incomingCustom.set(k.toLowerCase(), val);
      }
    }
  }

  // 5. Build final query pairs:
  // - Retain non-UTM query parameters in their original position.
  // - If an existing param is a UTM parameter that is also in incomingUtms, replace it in place.
  // - If an existing param is a UTM parameter that is NOT in incomingUtms, delete/omit it if not preserving, or keep it.
  const finalPairs: Array<{ key: string; value: string }> = [];
  const handledUtmKeys = new Set<string>();

  for (const item of existingParams) {
    const lowerKey = item.key.toLowerCase();
    if (standardKeySet.has(lowerKey)) {
      if (incomingUtms.has(lowerKey)) {
        // Replace with current builder value
        finalPairs.push({ key: lowerKey, value: incomingUtms.get(lowerKey)! });
        handledUtmKeys.add(lowerKey);
      } else if (preserveExistingParams) {
        // Keep existing UTM if no new value provided
        finalPairs.push(item);
      }
    } else {
      // Unrelated non-UTM query parameter - always preserve!
      finalPairs.push(item);
    }
  }

  // 6. Append remaining incoming standard UTM parameters in standard order
  for (const key of STANDARD_UTM_KEYS) {
    const lowerKey = key.toLowerCase();
    if (incomingUtms.has(lowerKey) && !handledUtmKeys.has(lowerKey)) {
      finalPairs.push({ key: lowerKey, value: incomingUtms.get(lowerKey)! });
      handledUtmKeys.add(lowerKey);
    }
  }

  // Append any remaining incoming custom parameters
  for (const [k, v] of incomingCustom.entries()) {
    if (!handledUtmKeys.has(k)) {
      finalPairs.push({ key: k, value: v });
      handledUtmKeys.add(k);
    }
  }

  // 7. Serialize query string with %20 for spaces
  const serializedQuery = finalPairs
    .map((p) => `${encodeParamComponent(p.key)}=${encodeParamComponent(p.value)}`)
    .join('&');

  const queryPart = serializedQuery ? `?${serializedQuery}` : '';

  // 8. Reconstruct final URL: urlPath + queryPart + fragment
  return `${urlPath}${queryPart}${fragment}`;
}
