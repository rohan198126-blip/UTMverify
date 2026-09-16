import { STANDARD_UTM_KEYS, type ParsedUrlResult, type UtmParamKey } from './types.ts';

/**
 * Validates whether a protocol-less string looks like a legitimate domain/hostname.
 * e.g. "example.com", "sub.domain.co.uk/path?utm_source=google", "localhost:3000"
 */
function isLikelyHostname(input: string): boolean {
  const firstPart = input.split(/[/?#]/)[0].trim();
  if (!firstPart) return false;

  // Localhost with optional port
  if (/^localhost(:\d+)?$/i.test(firstPart)) return true;

  // Standard domain format: optional subdomains + domain label + TLD of at least 2 chars
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}(:\d+)?$/;
  return domainRegex.test(firstPart);
}

/**
 * Checks whether a string has malformed percent-encoding sequences like "%2" or "%ZZ".
 */
function hasInvalidPercentEncoding(str: string): boolean {
  // Regex finding any '%' not followed by two hex digits [0-9A-Fa-f]
  return /%(?![0-9a-fA-F]{2})/.test(str);
}

/**
 * Extracts query parameters from a raw query string without dropping duplicates.
 */
function extractQueryMap(queryString: string): {
  allQueryParams: Record<string, string[]>;
  duplicateParams: Record<string, string[]>;
  rawParamCasing: Record<string, string>;
  hasMalformedEncoding: boolean;
} {
  const allQueryParams: Record<string, string[]> = {};
  const duplicateParams: Record<string, string[]> = {};
  const rawParamCasing: Record<string, string> = {};
  let hasMalformedEncoding = false;

  const cleanQuery = queryString.replace(/^\?/, '');
  if (!cleanQuery) {
    return { allQueryParams, duplicateParams, rawParamCasing, hasMalformedEncoding };
  }

  const pairs = cleanQuery.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const [rawKey, ...valParts] = pair.split('=');
    const rawVal = valParts.join('=');

    // Check for malformed percent encoding in key or value
    if (hasInvalidPercentEncoding(rawKey) || hasInvalidPercentEncoding(rawVal)) {
      hasMalformedEncoding = true;
    }

    let decodedKey = rawKey;
    let decodedVal = rawVal;
    try {
      decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {
      hasMalformedEncoding = true;
    }
    try {
      decodedVal = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch {
      hasMalformedEncoding = true;
    }

    const lowerKey = decodedKey.toLowerCase();
    rawParamCasing[lowerKey] = rawKey;

    if (!allQueryParams[lowerKey]) {
      allQueryParams[lowerKey] = [decodedVal];
    } else {
      allQueryParams[lowerKey].push(decodedVal);
      duplicateParams[lowerKey] = allQueryParams[lowerKey];
    }
  }

  return { allQueryParams, duplicateParams, rawParamCasing, hasMalformedEncoding };
}

/**
 * Parses raw input into structured components, identifying protocols, query strings,
 * fragment UTMs, duplicates, and encoding status.
 */
export function parseUtmUrl(inputUrl: string): ParsedUrlResult {
  const trimmed = inputUrl.trim();

  if (!trimmed) {
    return {
      rawInput: '',
      isValidUrl: false,
      hasMissingProtocol: false,
      hasFragmentUtm: false,
      fragmentUtmParams: {},
      utmParams: {} as Record<UtmParamKey, string>,
      customParams: {},
      duplicateParams: {},
      allQueryParams: {},
      rawParamCasing: {},
      hasRawWhitespace: false,
      hasMalformedEncoding: false,
    };
  }

  // Detect literal raw whitespace in the input
  const hasRawWhitespace = /\s/.test(trimmed);

  // Check protocol presence
  let urlToParse = trimmed;
  let hasMissingProtocol = false;

  const hasProtocolScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  if (!hasProtocolScheme) {
    if (isLikelyHostname(trimmed)) {
      urlToParse = `https://${trimmed}`;
      hasMissingProtocol = true;
    } else {
      // Malformed or invalid input that cannot be parsed as a URL
      return {
        rawInput: trimmed,
        isValidUrl: false,
        hasMissingProtocol: false,
        hasFragmentUtm: false,
        fragmentUtmParams: {},
        utmParams: {} as Record<UtmParamKey, string>,
        customParams: {},
        duplicateParams: {},
        allQueryParams: {},
        rawParamCasing: {},
        hasRawWhitespace,
        hasMalformedEncoding: false,
      };
    }
  }

  let parsed: URL;
  try {
    // If input had raw spaces, sanitize temporarily for URL constructor parse
    const parseable = urlToParse.replace(/\s+/g, '%20');
    parsed = new URL(parseable);
  } catch {
    return {
      rawInput: trimmed,
      isValidUrl: false,
      hasMissingProtocol,
      hasFragmentUtm: false,
      fragmentUtmParams: {},
      utmParams: {} as Record<UtmParamKey, string>,
      customParams: {},
      duplicateParams: {},
      allQueryParams: {},
      rawParamCasing: {},
      hasRawWhitespace,
      hasMalformedEncoding: false,
    };
  }

  // Verify hostname is not empty
  if (!parsed.hostname) {
    return {
      rawInput: trimmed,
      isValidUrl: false,
      hasMissingProtocol,
      hasFragmentUtm: false,
      fragmentUtmParams: {},
      utmParams: {} as Record<UtmParamKey, string>,
      customParams: {},
      duplicateParams: {},
      allQueryParams: {},
      rawParamCasing: {},
      hasRawWhitespace,
      hasMalformedEncoding: false,
    };
  }

  // Parse normal search parameters from raw query string to preserve casing & duplicates
  const rawSearchIndex = trimmed.indexOf('?');
  const rawHashIndex = trimmed.indexOf('#');
  let rawQuery = '';

  if (rawSearchIndex !== -1) {
    if (rawHashIndex === -1 || rawSearchIndex < rawHashIndex) {
      rawQuery = rawHashIndex === -1 ? trimmed.slice(rawSearchIndex) : trimmed.slice(rawSearchIndex, rawHashIndex);
    }
  }

  const { allQueryParams, duplicateParams, rawParamCasing, hasMalformedEncoding } = extractQueryMap(rawQuery || parsed.search);

  // Check for UTM parameters misplaced inside the fragment (e.g. #/page?utm_source=google)
  let hasFragmentUtm = false;
  const fragmentUtmParams: Record<string, string[]> = {};
  if (parsed.hash && parsed.hash.includes('?')) {
    const hashQuery = parsed.hash.slice(parsed.hash.indexOf('?'));
    const hashExtracted = extractQueryMap(hashQuery);
    for (const [key, vals] of Object.entries(hashExtracted.allQueryParams)) {
      if (STANDARD_UTM_KEYS.includes(key as UtmParamKey)) {
        hasFragmentUtm = true;
        fragmentUtmParams[key] = vals;
      }
    }
  }

  // Partition into standard UTM parameters vs custom query parameters
  const utmParams: Partial<Record<UtmParamKey, string>> = {};
  const customParams: Record<string, string[]> = {};

  for (const [key, values] of Object.entries(allQueryParams)) {
    if (STANDARD_UTM_KEYS.includes(key as UtmParamKey)) {
      // Store the primary/first value for display, while duplicates are tracked separately
      utmParams[key as UtmParamKey] = values[0];
    } else {
      customParams[key] = values;
    }
  }

  return {
    rawInput: trimmed,
    isValidUrl: true,
    protocol: hasMissingProtocol ? undefined : parsed.protocol,
    hasMissingProtocol,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
    search: parsed.search || undefined,
    hash: parsed.hash ? parsed.hash.replace(/^#/, '') : undefined,
    hasFragmentUtm,
    fragmentUtmParams,
    utmParams: utmParams as Record<UtmParamKey, string>,
    customParams,
    duplicateParams,
    allQueryParams,
    rawParamCasing,
    hasRawWhitespace,
    hasMalformedEncoding,
  };
}
