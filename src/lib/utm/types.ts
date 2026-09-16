/**
 * UTMVerify Core UTM Types & Validation Model
 * Shared across all tools and client-side validation logic.
 */

export interface UtmParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export type UtmParamKey = keyof UtmParameters;

export const STANDARD_UTM_KEYS: readonly UtmParamKey[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type ValidationSeverity = 'error' | 'warning' | 'info' | 'pass';

export type IssueCode =
  | 'INVALID_URL_FORMAT'
  | 'MISSING_PROTOCOL'
  | 'MISSING_HOSTNAME'
  | 'MALFORMED_ENCODING'
  | 'RAW_WHITESPACE'
  | 'FRAGMENT_UTM_DETECTED'
  | 'DUPLICATE_PARAMETER'
  | 'EMPTY_PARAMETER_VALUE'
  | 'UNEXPECTED_PARAM_CASING'
  | 'VALUE_UPPERCASE_WARNING'
  | 'VALUE_SPACES_WARNING'
  | 'NO_UTM_PARAMETERS'
  | 'VALID_UTM_STRUCTURE';

export interface UtmValidationIssue {
  code: IssueCode;
  severity: ValidationSeverity;
  message: string;
  field?: UtmParamKey | string;
  values?: string[];
  suggestion?: string;
}

export interface ValidationCheckCategory {
  id: 'url_structure' | 'utm_params' | 'duplicates' | 'encoding';
  title: string;
  status: ValidationSeverity;
  message?: string;
}

export interface ParsedUrlResult {
  rawInput: string;
  isValidUrl: boolean;
  protocol?: string;
  hasMissingProtocol: boolean;
  hostname?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  hasFragmentUtm: boolean;
  fragmentUtmParams: Record<string, string[]>;
  utmParams: Record<UtmParamKey, string>;
  customParams: Record<string, string[]>;
  duplicateParams: Record<string, string[]>;
  allQueryParams: Record<string, string[]>;
  rawParamCasing: Record<string, string>;
  hasRawWhitespace: boolean;
  hasMalformedEncoding: boolean;
}

export interface UtmValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  passCount: number;
  overallStatus: 'valid' | 'warning' | 'error';
  statusMessage: string;
  issues: UtmValidationIssue[];
  checks: ValidationCheckCategory[];
  parsed: ParsedUrlResult;
  correctedUrl?: string;
  correctionReasons: string[];
}

export interface UtmBuildOptions {
  baseUrl: string;
  params: UtmParameters;
  customParams?: Record<string, string>;
  preserveExistingParams?: boolean;
  lowercaseParams?: boolean;
}
