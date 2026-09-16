import {
  STANDARD_UTM_KEYS,
  type ParsedUrlResult,
  type UtmParamKey,
  type UtmValidationIssue,
  type UtmValidationResult,
  type ValidationCheckCategory,
} from './types.ts';

/**
 * Validates a parsed URL against web standards, UTM conventions, and tracking best practices.
 */
export function validateUtmUrl(parsed: ParsedUrlResult): UtmValidationResult {
  const issues: UtmValidationIssue[] = [];
  const correctionReasons: string[] = [];
  let correctedUrl: string | undefined = undefined;

  // Category status trackers
  let structureStatus: 'pass' | 'warning' | 'error' = 'pass';
  let paramsStatus: 'pass' | 'warning' | 'error' | 'info' = 'pass';
  let duplicatesStatus: 'pass' | 'warning' = 'pass';
  let encodingStatus: 'pass' | 'warning' | 'error' = 'pass';

  // --- 1. Basic URL Validity & Malformed Input ---
  if (!parsed.isValidUrl) {
    issues.push({
      code: 'INVALID_URL_FORMAT',
      severity: 'error',
      message: 'The provided text is not a valid absolute URL or recognized domain.',
      suggestion: 'Ensure the link includes a valid domain name (e.g. https://example.com/page).',
    });
    structureStatus = 'error';

    return {
      isValid: false,
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      passCount: 0,
      overallStatus: 'error',
      statusMessage: 'Invalid URL structure',
      issues,
      checks: [
        { id: 'url_structure', title: 'URL Structure', status: 'error', message: 'Malformed URL' },
        { id: 'utm_params', title: 'UTM Parameters', status: 'info', message: 'Not evaluated' },
        { id: 'duplicates', title: 'Duplicate Parameters', status: 'pass', message: 'None' },
        { id: 'encoding', title: 'URL Encoding', status: 'info', message: 'Not evaluated' },
      ],
      parsed,
      correctionReasons: [],
    };
  }

  // --- 2. Protocol Check ---
  let safeCorrectedUrl: string | null = null;
  let canSafelyCorrect = true;

  if (parsed.hasMissingProtocol) {
    issues.push({
      code: 'MISSING_PROTOCOL',
      severity: 'warning',
      message: 'URL is missing a protocol (https://). Browsers and ad platforms require an explicit protocol.',
      suggestion: `Add https:// to the start of the URL.`,
    });
    structureStatus = 'warning';
    correctionReasons.push('Added missing https:// protocol');
    safeCorrectedUrl = `https://${parsed.rawInput}`;
  }

  // --- 3. Broken Percent-Encoding Check ---
  if (parsed.hasMalformedEncoding) {
    issues.push({
      code: 'MALFORMED_ENCODING',
      severity: 'error',
      message: 'The URL contains invalid percent-encoding (e.g. incomplete or non-hex escape sequences).',
      suggestion: 'Check for stray % characters that are not part of a valid hex code (like %20).',
    });
    encodingStatus = 'error';
    canSafelyCorrect = false; // Cannot guess what corrupted encoding was intended
  }

  // --- 4. Literal Raw Whitespace in Input ---
  if (parsed.hasRawWhitespace) {
    issues.push({
      code: 'RAW_WHITESPACE',
      severity: 'warning',
      message: 'The URL contains unencoded literal whitespace characters.',
      suggestion: 'Encode spaces as %20 or + to prevent broken links in email clients and messaging apps.',
    });
    if (encodingStatus !== 'error') encodingStatus = 'warning';
    correctionReasons.push('Encoded raw spaces as %20');
  }

  // --- 5. Fragment UTM Placement (e.g. #/page?utm_source=google) ---
  if (parsed.hasFragmentUtm) {
    const fragmentKeys = Object.keys(parsed.fragmentUtmParams).join(', ');
    issues.push({
      code: 'FRAGMENT_UTM_DETECTED',
      severity: 'warning',
      message: `UTM parameters (${fragmentKeys}) were found inside the URL fragment (#). Analytics tools typically ignore fragment query strings.`,
      suggestion: 'Place UTM parameters before the hash fragment (e.g. https://example.com/page?utm_source=...#section).',
    });
    structureStatus = 'warning';
    // Per user instruction: Do NOT automatically move fragment parameters unless unambiguous
    canSafelyCorrect = false;
  }

  // --- 6. Duplicate UTM Parameters ---
  for (const [key, values] of Object.entries(parsed.duplicateParams)) {
    if (STANDARD_UTM_KEYS.includes(key as UtmParamKey)) {
      duplicatesStatus = 'warning';
      const uniqueValues = Array.from(new Set(values));
      const hasConflictingValues = uniqueValues.length > 1;

      issues.push({
        code: 'DUPLICATE_PARAMETER',
        severity: 'warning',
        field: key as UtmParamKey,
        values,
        message: hasConflictingValues
          ? `Parameter "${key}" appears ${values.length} times with conflicting values: ${values.map(v => `"${v}"`).join(', ')}.`
          : `Parameter "${key}" is duplicated with identical values.`,
        suggestion: 'Remove redundant duplicates to prevent unpredictable attribution in analytics.',
      });

      // If conflicting duplicate values exist, do NOT automatically pick one
      canSafelyCorrect = false;
    }
  }

  // --- 7. Empty UTM Values (e.g. ?utm_source=) ---
  for (const key of STANDARD_UTM_KEYS) {
    if (key in parsed.allQueryParams) {
      const val = parsed.utmParams[key];
      if (!val || val.trim() === '') {
        issues.push({
          code: 'EMPTY_PARAMETER_VALUE',
          severity: 'warning',
          field: key,
          message: `Parameter "${key}" is defined but has an empty value.`,
          suggestion: 'Provide a non-empty value or remove the parameter entirely.',
        });
        if (paramsStatus === 'pass') paramsStatus = 'warning';
      }
    }
  }

  // --- 8. Parameter Key Casing (e.g. UTM_SOURCE or utm_Source) ---
  for (const [lowerKey, rawKey] of Object.entries(parsed.rawParamCasing)) {
    if (STANDARD_UTM_KEYS.includes(lowerKey as UtmParamKey)) {
      if (rawKey !== lowerKey) {
        issues.push({
          code: 'UNEXPECTED_PARAM_CASING',
          severity: 'warning',
          field: lowerKey as UtmParamKey,
          message: `Parameter key "${rawKey}" uses non-standard casing. UTM parameter keys are case-sensitive and expected in lowercase.`,
          suggestion: `Change "${rawKey}" to "${lowerKey}".`,
        });
        if (paramsStatus === 'pass') paramsStatus = 'warning';
        correctionReasons.push(`Normalized parameter key "${rawKey}" to "${lowerKey}"`);
      }
    }
  }

  // --- 9. Value Capitalization (e.g. utm_source=Facebook) ---
  for (const [key, value] of Object.entries(parsed.utmParams)) {
    if (value && /[A-Z]/.test(value)) {
      issues.push({
        code: 'VALUE_UPPERCASE_WARNING',
        severity: 'warning',
        field: key as UtmParamKey,
        message: `Value for "${key}" contains uppercase letters ("${value}"). Analytics platforms like Google Analytics treat "Facebook" and "facebook" as separate channels.`,
        suggestion: 'Consider standardizing campaign parameter values to all-lowercase.',
      });
      if (paramsStatus === 'pass') paramsStatus = 'warning';
      // Note: We do NOT force lowercase on values in correctedUrl to prevent silent semantic alteration
    }
  }

  // --- 10. Value Spaces (e.g. utm_campaign=Summer Sale or Summer%20Sale) ---
  for (const [key, value] of Object.entries(parsed.utmParams)) {
    if (value && /\s/.test(value)) {
      issues.push({
        code: 'VALUE_SPACES_WARNING',
        severity: 'warning',
        field: key as UtmParamKey,
        message: `Value for "${key}" contains spaces ("${value}"). Spaces can lead to inconsistent tagging and ugly URLs.`,
        suggestion: 'Use hyphens (-) or underscores (_) instead of spaces for consistent tracking.',
      });
      if (paramsStatus === 'pass') paramsStatus = 'warning';
    }
  }

  // --- 11. General UTM Parameter Presence Overview ---
  const presentUtmKeys = Object.keys(parsed.utmParams).filter(
    k => STANDARD_UTM_KEYS.includes(k as UtmParamKey) && parsed.utmParams[k as UtmParamKey] !== undefined
  );

  if (presentUtmKeys.length === 0 && !parsed.hasFragmentUtm) {
    issues.push({
      code: 'NO_UTM_PARAMETERS',
      severity: 'info',
      message: 'No UTM tracking parameters were detected in this URL.',
      suggestion: 'Use the UTM Builder if you want to add tracking parameters to this destination.',
    });
    paramsStatus = 'info';
  } else {
    // Note: UTM source alone can be valid. We do not require all 5.
    if (!parsed.utmParams.utm_source && presentUtmKeys.length > 0) {
      issues.push({
        code: 'VALID_UTM_STRUCTURE',
        severity: 'warning',
        field: 'utm_source',
        message: 'The URL includes UTM parameters but is missing "utm_source" (the primary traffic attribution tag).',
        suggestion: 'Always include at least utm_source to identify traffic origins in analytics.',
      });
      if (paramsStatus === 'pass') paramsStatus = 'warning';
    }
  }

  // --- 12. Corrected URL Assembly ---
  // Only generate correctedUrl when deterministic, unambiguous, and safe:
  // - Protocol missing on legitimate domain -> add https://
  // - Raw literal whitespace in input -> percent-encode spaces as %20
  // - Uppercase parameter keys -> lowercase keys (without changing value semantics)
  if (canSafelyCorrect && correctionReasons.length > 0) {
    try {
      let baseWorkingUrl = safeCorrectedUrl || parsed.rawInput;
      // Handle raw spaces encoding
      baseWorkingUrl = baseWorkingUrl.replace(/\s+/g, '%20');

      const urlObj = new URL(baseWorkingUrl);

      // Reconstruct search parameters with normalized lowercase keys
      const newSearchParams = new URLSearchParams();
      for (const [k, v] of urlObj.searchParams.entries()) {
        const lowerK = k.toLowerCase();
        // If key was uppercase standard UTM, normalize key name
        if (STANDARD_UTM_KEYS.includes(lowerK as UtmParamKey)) {
          newSearchParams.append(lowerK, v);
        } else {
          newSearchParams.append(k, v);
        }
      }
      urlObj.search = newSearchParams.toString().replace(/\+/g, '%20');
      correctedUrl = urlObj.toString();
    } catch {
      correctedUrl = undefined;
    }
  }

  // Tally issue severities
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  const passCount = issues.filter(i => i.severity === 'pass').length;

  const isValid = errorCount === 0;
  let overallStatus: 'valid' | 'warning' | 'error' = 'valid';
  let statusMessage = 'URL looks good';

  if (errorCount > 0) {
    overallStatus = 'error';
    statusMessage = errorCount === 1 ? '1 structural error found' : `${errorCount} structural errors found`;
  } else if (warningCount > 0) {
    overallStatus = 'warning';
    statusMessage = warningCount === 1 ? '1 issue to review' : `${warningCount} issues to review`;
  } else if (presentUtmKeys.length === 0) {
    statusMessage = 'Valid URL (no UTM tags)';
  }

  // Compile check categories
  const checks: ValidationCheckCategory[] = [
    {
      id: 'url_structure',
      title: 'URL structure',
      status: structureStatus,
      message: structureStatus === 'pass' ? 'Valid' : structureStatus === 'warning' ? 'Protocol/syntax warning' : 'Malformed',
    },
    {
      id: 'utm_params',
      title: 'UTM parameters',
      status: paramsStatus,
      message:
        paramsStatus === 'pass'
          ? `${presentUtmKeys.length} standard tags present`
          : paramsStatus === 'info'
          ? 'None present'
          : 'Review tags',
    },
    {
      id: 'duplicates',
      title: 'Duplicates',
      status: duplicatesStatus,
      message: duplicatesStatus === 'pass' ? 'None' : 'Duplicate keys found',
    },
    {
      id: 'encoding',
      title: 'Encoding',
      status: encodingStatus,
      message: encodingStatus === 'pass' ? 'Valid' : encodingStatus === 'warning' ? 'Unencoded spaces' : 'Malformed encoding',
    },
  ];

  return {
    isValid,
    errorCount,
    warningCount,
    infoCount,
    passCount,
    overallStatus,
    statusMessage,
    issues,
    checks,
    parsed,
    correctedUrl,
    correctionReasons,
  };
}
