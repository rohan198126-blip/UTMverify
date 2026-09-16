import { parseUtmUrl, parseCampaignUrl } from './parse.ts';
import { validateUtmUrl } from './validate.ts';
import { buildUtmUrl } from './build.ts';
import {
  normalizeNamingSegment,
  generateCampaignName,
  generateNaming,
} from './naming.ts';
import {
  validateBulkRow,
  generateBulkRowUrl,
  processBulkRows,
  parseCsv,
  parseBulkCsv,
  exportBulkCsv,
  BULK_PRESETS,
  EXAMPLE_BULK_ROWS,
} from './bulk.ts';

interface ValidationTestCase {
  id: number;
  name: string;
  input: string;
  assert: (res: ReturnType<typeof validateUtmUrl>) => boolean;
  description: string;
}

interface BuilderTestCase {
  id: number;
  name: string;
  run: () => { passed: boolean; actual: string; expected: string; reason?: string };
  description: string;
}

interface ParserTestCase {
  id: number;
  name: string;
  input: string;
  run: () => { passed: boolean; actual?: any; expected?: any; reason?: string };
  description: string;
}

const validationTestCases: ValidationTestCase[] = [
  {
    id: 1,
    name: 'Plain valid URL',
    input: 'https://example.com',
    assert: (res) => res.isValid && res.errorCount === 0 && res.warningCount === 0,
    description: 'Valid URL without UTMs passes cleanly with 0 errors.',
  },
  {
    id: 2,
    name: 'Valid URL with one UTM',
    input: 'https://example.com/?utm_source=google',
    assert: (res) => res.isValid && res.parsed.utmParams.utm_source === 'google' && res.errorCount === 0 && res.warningCount === 0,
    description: 'Single utm_source is completely valid and produces no warnings.',
  },
  {
    id: 3,
    name: 'Complete valid UTM URL',
    input: 'https://example.com/shop?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&utm_term=running_shoes&utm_content=logolink',
    assert: (res) =>
      res.isValid &&
      res.errorCount === 0 &&
      res.warningCount === 0 &&
      Boolean(res.parsed.utmParams.utm_source) &&
      Boolean(res.parsed.utmParams.utm_medium) &&
      Boolean(res.parsed.utmParams.utm_campaign) &&
      Boolean(res.parsed.utmParams.utm_term) &&
      Boolean(res.parsed.utmParams.utm_content),
    description: 'All 5 UTM parameters present and valid.',
  },
  {
    id: 4,
    name: 'Empty UTM value',
    input: 'https://example.com/?utm_source=&utm_medium=cpc',
    assert: (res) => res.isValid && res.issues.some((i) => i.code === 'EMPTY_PARAMETER_VALUE' && i.field === 'utm_source'),
    description: 'Empty utm_source triggers EMPTY_PARAMETER_VALUE warning.',
  },
  {
    id: 5,
    name: 'Duplicate UTM parameter',
    input: 'https://example.com/?utm_source=facebook&utm_source=google',
    assert: (res) =>
      res.isValid && // Per instruction: NOT an error, but warning
      res.warningCount > 0 &&
      res.issues.some((i) => i.code === 'DUPLICATE_PARAMETER' && i.field === 'utm_source') &&
      res.parsed.duplicateParams.utm_source.length === 2,
    description: 'Duplicate parameters flagged as WARNING with conflicting values preserved.',
  },
  {
    id: 6,
    name: 'Encoded campaign name',
    input: 'https://example.com/?utm_source=google&utm_campaign=Summer%20Sale',
    assert: (res) => res.isValid && !res.parsed.hasMalformedEncoding && res.parsed.utmParams.utm_campaign === 'Summer Sale',
    description: 'Percent-encoded space is structurally valid and properly decoded.',
  },
  {
    id: 7,
    name: 'URL with unrelated query parameters',
    input: 'https://example.com/page?ref=affiliate&user_id=123&utm_source=newsletter',
    assert: (res) =>
      res.isValid &&
      Boolean(res.parsed.customParams.ref) &&
      Boolean(res.parsed.customParams.user_id) &&
      res.parsed.utmParams.utm_source === 'newsletter',
    description: 'Non-UTM query parameters are fully preserved.',
  },
  {
    id: 8,
    name: 'URL with fragment',
    input: 'https://example.com/page?utm_source=google#section-2',
    assert: (res) => res.isValid && res.parsed.hash === 'section-2' && res.parsed.utmParams.utm_source === 'google',
    description: 'Fragment hash correctly identified and separated from query string.',
  },
  {
    id: 9,
    name: 'Malformed URL',
    input: 'https://::invalid',
    assert: (res) => !res.isValid && res.errorCount > 0 && res.issues.some((i) => i.code === 'INVALID_URL_FORMAT'),
    description: 'Unparseable URL correctly identified as ERROR.',
  },
  {
    id: 10,
    name: 'Missing protocol',
    input: 'example.com/?utm_source=google',
    assert: (res) =>
      res.isValid &&
      res.parsed.hasMissingProtocol &&
      res.issues.some((i) => i.code === 'MISSING_PROTOCOL') &&
      res.correctedUrl === 'https://example.com/?utm_source=google',
    description: 'Missing protocol on valid domain flagged as warning with safe https:// correction.',
  },
  {
    id: 11,
    name: 'Uppercase UTM value',
    input: 'https://example.com/?utm_source=Facebook',
    assert: (res) => res.isValid && res.issues.some((i) => i.code === 'VALUE_UPPERCASE_WARNING' && i.field === 'utm_source'),
    description: 'Uppercase letter in parameter value flagged as naming consistency warning.',
  },
  {
    id: 12,
    name: 'Spaces in UTM value (raw literal whitespace)',
    input: 'https://example.com/?utm_source=google&utm_campaign=Summer Sale',
    assert: (res) =>
      res.isValid &&
      res.parsed.hasRawWhitespace &&
      res.issues.some((i) => i.code === 'RAW_WHITESPACE') &&
      Boolean(res.correctedUrl && res.correctedUrl.includes('%20')),
    description: 'Raw space flagged as warning and safely percent-encoded in correctedUrl.',
  },
  {
    id: 13,
    name: 'Multiple non-UTM parameters',
    input: 'https://example.com/?id=1&sort=desc&filter=all&utm_source=email',
    assert: (res) =>
      res.isValid &&
      Boolean(res.parsed.customParams.id) &&
      Boolean(res.parsed.customParams.sort) &&
      Boolean(res.parsed.customParams.filter),
    description: 'Multiple non-UTM query parameters intact without collision.',
  },
  {
    id: 14,
    name: 'UTM parameter with unexpected capitalization',
    input: 'https://example.com/?UTM_SOURCE=google',
    assert: (res) =>
      res.isValid &&
      res.issues.some((i) => i.code === 'UNEXPECTED_PARAM_CASING' && i.field === 'utm_source') &&
      Boolean(res.correctedUrl && res.correctedUrl.includes('utm_source=google')),
    description: 'Uppercase parameter key flagged as warning and normalized in correctedUrl.',
  },
];

const builderTestCases: BuilderTestCase[] = [
  {
    id: 15,
    name: 'Builder 1: Basic URL generation',
    description: 'Standard baseUrl with source, medium, campaign produces clean query string.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/landing',
        params: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'summer_sale' },
      });
      const expected = 'https://example.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 16,
    name: 'Builder 2: Existing non-UTM query parameter preservation',
    description: 'Preserves existing query parameters (e.g. ref=home) and appends UTM parameters with &.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/page?ref=home',
        params: { utm_source: 'google' },
      });
      const expected = 'https://example.com/page?ref=home&utm_source=google';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 17,
    name: 'Builder 3: Fragment hash preservation',
    description: 'Query string must be placed strictly BEFORE the #fragment.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/page#pricing',
        params: { utm_source: 'google' },
      });
      const expected = 'https://example.com/page?utm_source=google#pricing';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 18,
    name: 'Builder 4: Query + fragment combination',
    description: 'Both existing query parameters and #fragment are preserved with UTM inserted before fragment.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/page?ref=home#pricing',
        params: { utm_source: 'google' },
      });
      const expected = 'https://example.com/page?ref=home&utm_source=google#pricing';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 19,
    name: 'Builder 5: Empty optional parameters',
    description: 'Empty term or content do not leave dangling & or empty keys.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/page',
        params: { utm_source: 'google', utm_medium: 'cpc', utm_term: '', utm_content: '   ' },
      });
      const expected = 'https://example.com/page?utm_source=google&utm_medium=cpc';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 20,
    name: 'Builder 6: URL encoding of spaces (%20, never +)',
    description: 'Campaign value with spaces must use %20 encoding, never +.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/store',
        params: { utm_source: 'newsletter', utm_campaign: 'Summer Sale 2026' },
      });
      const expected = 'https://example.com/store?utm_source=newsletter&utm_campaign=Summer%20Sale%202026';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 21,
    name: 'Builder 7: Special characters encoding (&, =, ?, +, #, %)',
    description: 'Special characters inside parameter values are safely escaped without breaking URL structure.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/promo',
        params: { utm_source: 'ad&partner', utm_campaign: 'sale=50%+free#1' },
      });
      const expected = 'https://example.com/promo?utm_source=ad%26partner&utm_campaign=sale%3D50%25%2Bfree%231';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 22,
    name: 'Builder 8: Existing UTM replacement (no duplicates)',
    description: 'If destination already contains a UTM parameter, builder replaces it rather than creating a duplicate.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/page?ref=home&utm_source=facebook',
        params: { utm_source: 'google', utm_medium: 'cpc' },
      });
      const expected = 'https://example.com/page?ref=home&utm_source=google&utm_medium=cpc';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 23,
    name: 'Builder 9: Protocol-less destination preservation',
    description: 'Protocol-less destinations retain their lack of protocol without fabricating https://.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'example.com/page',
        params: { utm_source: 'google' },
      });
      const expected = 'example.com/page?utm_source=google';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 24,
    name: 'Builder 10: Correct & delimiter without duplicate ?',
    description: 'Multiple query parameters with & delimiter without duplicate ? marks.',
    run: () => {
      const actual = buildUtmUrl({
        baseUrl: 'https://example.com/page?a=1&b=2',
        params: { utm_source: 'email', utm_medium: 'newsletter', utm_campaign: 'weekly' },
      });
      const expected = 'https://example.com/page?a=1&b=2&utm_source=email&utm_medium=newsletter&utm_campaign=weekly';
      const noDuplicateQ = (actual.match(/\?/g) || []).length === 1;
      return { passed: actual === expected && noDuplicateQ, actual, expected };
    },
  },
];

const parserTestCases: ParserTestCase[] = [
  {
    id: 25,
    name: 'Parser 1: Plain URL',
    description: 'Extracts clean base URL and hostname with 0 parameters and no fragment.',
    input: 'https://example.com/page',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page');
      const passed =
        res.baseUrl === 'https://example.com/page' &&
        res.hostname === 'example.com' &&
        res.totalParameters === 0 &&
        !res.hasUtm &&
        !res.hasCustom &&
        !res.fragment;
      return { passed, actual: res, expected: 'baseUrl=https://example.com/page, totalParameters=0' };
    },
  },
  {
    id: 26,
    name: 'Parser 2: Single UTM parameter',
    description: 'Extracts single UTM source parameter correctly.',
    input: 'https://example.com/page?utm_source=google',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page?utm_source=google');
      const passed =
        res.utm.source === 'google' &&
        res.standardParams.length === 1 &&
        res.totalParameters === 1 &&
        res.hasUtm &&
        !res.hasCustom;
      return { passed, actual: res.utm, expected: '{ source: "google" }' };
    },
  },
  {
    id: 27,
    name: 'Parser 3: Complete valid UTM URL',
    description: 'Extracts all 5 standard UTM parameters and attributes them correctly.',
    input: 'https://example.com/shop?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&utm_term=running_shoes&utm_content=logolink',
    run: () => {
      const res = parseCampaignUrl('https://example.com/shop?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&utm_term=running_shoes&utm_content=logolink');
      const passed =
        res.utm.source === 'google' &&
        res.utm.medium === 'cpc' &&
        res.utm.campaign === 'summer_sale' &&
        res.utm.term === 'running_shoes' &&
        res.utm.content === 'logolink' &&
        res.standardParams.length === 5 &&
        res.totalParameters === 5 &&
        !res.hasCustom;
      return { passed, actual: res.utm, expected: 'All 5 UTM parameters extracted' };
    },
  },
  {
    id: 28,
    name: 'Parser 4: Existing non-UTM query parameter',
    description: 'Separates custom query parameter (ref=homepage) into custom parameters list.',
    input: 'https://example.com/page?ref=homepage',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page?ref=homepage');
      const passed =
        res.customParams.length === 1 &&
        res.customParams[0].key === 'ref' &&
        res.customParams[0].value === 'homepage' &&
        !res.hasUtm &&
        res.hasCustom &&
        res.totalParameters === 1;
      return { passed, actual: res.customParams, expected: '[{ key: "ref", value: "homepage" }]' };
    },
  },
  {
    id: 29,
    name: 'Parser 5: Query + UTM parameters',
    description: 'Distinguishes custom query parameters from standard UTM parameters without overlap.',
    input: 'https://example.com/page?ref=homepage&utm_source=google',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page?ref=homepage&utm_source=google');
      const passed =
        res.customParams.length === 1 &&
        res.customParams[0].key === 'ref' &&
        res.standardParams.length === 1 &&
        res.utm.source === 'google' &&
        res.totalParameters === 2 &&
        res.hasUtm &&
        res.hasCustom;
      return { passed, actual: { custom: res.customParams, utm: res.utm }, expected: '1 custom + 1 UTM' };
    },
  },
  {
    id: 30,
    name: 'Parser 6: URL with fragment',
    description: 'Extracts hash fragment cleanly without polluting query parameters.',
    input: 'https://example.com/page#pricing',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page#pricing');
      const passed =
        res.baseUrl === 'https://example.com/page' &&
        res.fragment === 'pricing' &&
        res.totalParameters === 0;
      return { passed, actual: { baseUrl: res.baseUrl, fragment: res.fragment }, expected: 'fragment=pricing' };
    },
  },
  {
    id: 31,
    name: 'Parser 7: Query + fragment',
    description: 'Properly isolates base URL, query parameters, and fragment.',
    input: 'https://example.com/page?utm_source=google#pricing',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page?utm_source=google#pricing');
      const passed =
        res.baseUrl === 'https://example.com/page' &&
        res.utm.source === 'google' &&
        res.fragment === 'pricing' &&
        res.totalParameters === 1;
      return { passed, actual: { baseUrl: res.baseUrl, fragment: res.fragment, utm: res.utm }, expected: '1 UTM + fragment=pricing' };
    },
  },
  {
    id: 32,
    name: 'Parser 8: Protocol-less URL',
    description: 'Identifies missing protocol while preserving original base destination.',
    input: 'example.com/page?utm_source=google',
    run: () => {
      const res = parseCampaignUrl('example.com/page?utm_source=google');
      const passed =
        res.hasMissingProtocol === true &&
        res.baseUrl === 'example.com/page' &&
        res.utm.source === 'google';
      return { passed, actual: { hasMissingProtocol: res.hasMissingProtocol, baseUrl: res.baseUrl }, expected: 'hasMissingProtocol=true' };
    },
  },
  {
    id: 33,
    name: 'Parser 9: Percent-encoded value',
    description: 'Correctly decodes percent-encoded characters (%20 -> space).',
    input: 'https://example.com/?utm_campaign=Summer%20Sale',
    run: () => {
      const res = parseCampaignUrl('https://example.com/?utm_campaign=Summer%20Sale');
      const passed =
        res.utm.campaign === 'Summer Sale' &&
        res.standardParams[0].value === 'Summer Sale';
      return { passed, actual: res.utm.campaign, expected: 'Summer Sale' };
    },
  },
  {
    id: 34,
    name: 'Parser 10: Duplicate parameter preservation',
    description: 'Detects duplicate parameters and retains all conflicting values without discarding.',
    input: 'https://example.com/?utm_source=facebook&utm_source=google',
    run: () => {
      const res = parseCampaignUrl('https://example.com/?utm_source=facebook&utm_source=google');
      const passed =
        res.hasDuplicates === true &&
        res.duplicates.length === 1 &&
        res.duplicates[0].key === 'utm_source' &&
        res.duplicates[0].values.length === 2 &&
        res.duplicates[0].values.includes('facebook') &&
        res.duplicates[0].values.includes('google');
      return { passed, actual: res.duplicates, expected: 'duplicates with facebook and google' };
    },
  },
  {
    id: 35,
    name: 'Parser 11: Multiple custom parameters',
    description: 'Extracts and lists multiple custom parameters in order.',
    input: 'https://example.com/page?ref=home&lang=en&aff=123',
    run: () => {
      const res = parseCampaignUrl('https://example.com/page?ref=home&lang=en&aff=123');
      const passed =
        res.customParams.length === 3 &&
        res.totalParameters === 3 &&
        !res.hasUtm &&
        res.hasCustom &&
        res.customParams[0].key === 'ref' &&
        res.customParams[1].key === 'lang' &&
        res.customParams[2].key === 'aff';
      return { passed, actual: res.customParams.map((p) => p.key), expected: '["ref", "lang", "aff"]' };
    },
  },
  {
    id: 36,
    name: 'Parser 12: Empty parameter value',
    description: 'Preserves empty parameter values without throwing or crashing.',
    input: 'https://example.com/?utm_source=&utm_medium=cpc',
    run: () => {
      const res = parseCampaignUrl('https://example.com/?utm_source=&utm_medium=cpc');
      const passed =
        res.utm.source === '' &&
        res.utm.medium === 'cpc' &&
        res.standardParams.length === 2 &&
        res.totalParameters === 2;
      return { passed, actual: res.utm, expected: '{ source: "", medium: "cpc" }' };
    },
  },
];

interface NamingTestCase {
  id: number;
  name: string;
  description: string;
  run: () => { passed: boolean; actual?: any; expected?: any; reason?: string };
}

const namingTestCases: NamingTestCase[] = [
  {
    id: 37,
    name: 'Naming 1: Basic campaign naming',
    description: 'Constructs standardized campaign name from primary inputs.',
    run: () => {
      const actual = generateCampaignName(
        { campaign: 'Summer Sale', source: 'Google', medium: 'CPC' },
        'simple'
      );
      const expected = 'summer_sale_google_cpc';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 38,
    name: 'Naming 2: Lowercase normalization',
    description: 'Converts all uppercase or mixed-case characters into clean lowercase.',
    run: () => {
      const actual = normalizeNamingSegment('SUMMER SALE CPC');
      const expected = 'summer_sale_cpc';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 39,
    name: 'Naming 3: Space normalization',
    description: 'Converts spaces, tabs, and multi-spaces into single underscores.',
    run: () => {
      const actual = normalizeNamingSegment('  Summer   \t  Sale \n  2026  ');
      const expected = 'summer_sale_2026';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 40,
    name: 'Naming 4: Punctuation normalization',
    description: 'Strips unnecessary punctuation symbols (!, @, #, $, %, etc.) while preserving alphanumeric tokens.',
    run: () => {
      const actual = normalizeNamingSegment('Summer & Sale! (50% Off)*');
      const expected = 'summer_sale_50_off';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 41,
    name: 'Naming 5: Repeated separator cleanup',
    description: 'Cleans up repeated underscores, hyphens, and removes leading/trailing separators.',
    run: () => {
      const actual = normalizeNamingSegment('__summer___sale--promo__');
      const expected = 'summer_sale-promo';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 42,
    name: 'Naming 6: Simple preset',
    description: 'Applies Simple preset: campaign_source_medium.',
    run: () => {
      const actual = generateCampaignName(
        { campaign: 'Summer Sale', source: 'Google', medium: 'CPC' },
        'simple'
      );
      const expected = 'summer_sale_google_cpc';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 43,
    name: 'Naming 7: Source First preset',
    description: 'Applies Source First preset: source_medium_campaign.',
    run: () => {
      const actual = generateCampaignName(
        { campaign: 'Summer Sale', source: 'Google', medium: 'CPC' },
        'source_first'
      );
      const expected = 'google_cpc_summer_sale';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 44,
    name: 'Naming 8: Campaign First preset',
    description: 'Applies Campaign First preset: campaign_objective_source_medium.',
    run: () => {
      const actual = generateCampaignName(
        { campaign: 'Summer Sale', objective: 'Sale', source: 'Google', medium: 'CPC' },
        'campaign_first'
      );
      const expected = 'summer_sale_sale_google_cpc';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 45,
    name: 'Naming 9: Full Campaign preset',
    description: 'Applies Full Campaign preset with all components.',
    run: () => {
      const actual = generateCampaignName(
        {
          campaign: 'Summer Sale',
          source: 'Google',
          medium: 'CPC',
          objective: 'Sale',
          audience: 'Retargeting',
          creative: 'Video 01',
          period: '2026-09',
        },
        'full'
      );
      const expected = 'summer_sale_google_cpc_sale_retargeting_video_01_2026-09';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 46,
    name: 'Naming 10: Optional audience',
    description: 'Incorporates audience into naming and maps to suggested utm_term.',
    run: () => {
      const res = generateNaming(
        { campaign: 'Launch', audience: 'Existing Customers' },
        'full'
      );
      const passed =
        res.campaignName === 'launch_existing_customers' &&
        res.suggestedUtm.utm_term === 'existing_customers';
      return { passed, actual: res, expected: 'launch_existing_customers with utm_term=existing_customers' };
    },
  },
  {
    id: 47,
    name: 'Naming 11: Optional creative',
    description: 'Incorporates creative into naming and maps to suggested utm_content.',
    run: () => {
      const res = generateNaming(
        { campaign: 'Launch', creative: 'Banner Ad 300x250' },
        'full'
      );
      const passed =
        res.campaignName === 'launch_banner_ad_300x250' &&
        res.suggestedUtm.utm_content === 'banner_ad_300x250';
      return { passed, actual: res, expected: 'launch_banner_ad_300x250 with utm_content=banner_ad_300x250' };
    },
  },
  {
    id: 48,
    name: 'Naming 12: Optional period',
    description: 'Preserves date/period formatting without producing accidental separators.',
    run: () => {
      const actual = generateCampaignName(
        { campaign: 'Winter Promo', period: '2026-Q4' },
        'full'
      );
      const expected = 'winter_promo_2026-q4';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 49,
    name: 'Naming 13: Missing optional values & no stray separators',
    description: 'Skips empty optional inputs without leaving double underscores or trailing delimiters.',
    run: () => {
      const actual = generateCampaignName(
        { campaign: 'Flash Sale', source: 'Email', medium: '', audience: '', creative: 'Gif 02' },
        'full'
      );
      const expected = 'flash_sale_email_gif_02';
      return { passed: actual === expected, actual, expected };
    },
  },
  {
    id: 50,
    name: 'Naming 14: Empty inputs handling',
    description: 'Returns empty string and hasInput=false when inputs are empty.',
    run: () => {
      const res = generateNaming({});
      const passed = res.campaignName === '' && res.hasInput === false;
      return { passed, actual: res, expected: 'empty campaignName and hasInput=false' };
    },
  },
];

const bulkTestCases: Array<{
  id: number;
  name: string;
  description: string;
  run: () => { passed: boolean; actual?: any; expected?: any };
}> = [
  {
    id: 51,
    name: 'Bulk 1: Single valid bulk row',
    description: 'Validates and generates a complete campaign URL for a single valid row.',
    run: () => {
      const row = {
        id: 'r1',
        destination: 'https://example.com/landing',
        source: 'google',
        medium: 'cpc',
        campaign: 'spring_sale',
        term: 'running_shoes',
        content: 'hero_banner',
      };
      const val = validateBulkRow(row);
      const url = generateBulkRowUrl(row);
      const expected = 'https://example.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale&utm_term=running_shoes&utm_content=hero_banner';
      const passed = val.isValid && url === expected;
      return { passed, actual: url, expected };
    },
  },
  {
    id: 52,
    name: 'Bulk 2: Multiple valid rows',
    description: 'Processes multiple valid rows and produces valid results for each.',
    run: () => {
      const results = processBulkRows(EXAMPLE_BULK_ROWS);
      const allValid = results.length === 3 && results.every((r) => r.isValid && r.generatedUrl.length > 0);
      return { passed: allValid, actual: results.length, expected: 3 };
    },
  },
  {
    id: 53,
    name: 'Bulk 3: Empty optional term',
    description: 'Omits utm_term when optional term field is empty or undefined.',
    run: () => {
      const row = {
        id: 'r3',
        destination: 'https://example.com',
        source: 'meta',
        medium: 'paid_social',
        campaign: 'brand_video',
        term: '',
        content: 'video_ad',
      };
      const url = generateBulkRowUrl(row);
      const passed = !url.includes('utm_term') && url.includes('utm_content=video_ad');
      return { passed, actual: url, expected: 'URL with utm_content but without utm_term' };
    },
  },
  {
    id: 54,
    name: 'Bulk 4: Empty optional content',
    description: 'Omits utm_content when optional content field is empty or undefined.',
    run: () => {
      const row = {
        id: 'r4',
        destination: 'https://example.com',
        source: 'meta',
        medium: 'paid_social',
        campaign: 'brand_video',
        term: 'retargeting',
        content: '',
      };
      const url = generateBulkRowUrl(row);
      const passed = url.includes('utm_term=retargeting') && !url.includes('utm_content');
      return { passed, actual: url, expected: 'URL with utm_term but without utm_content' };
    },
  },
  {
    id: 55,
    name: 'Bulk 5: Existing query string preservation',
    description: 'Preserves existing query parameters in the destination URL while appending UTMs.',
    run: () => {
      const row = {
        id: 'r5',
        destination: 'https://example.com/catalog?category=shoes&sort=price',
        source: 'google',
        medium: 'cpc',
        campaign: 'clearance',
      };
      const url = generateBulkRowUrl(row);
      const passed =
        url.includes('category=shoes') &&
        url.includes('sort=price') &&
        url.includes('utm_campaign=clearance') &&
        (url.match(/\?/g) || []).length === 1;
      return { passed, actual: url, expected: 'Single ? with existing params and appended UTMs' };
    },
  },
  {
    id: 56,
    name: 'Bulk 6: Existing fragment preservation',
    description: 'Preserves hash fragment and places it at the very end of the generated URL.',
    run: () => {
      const row = {
        id: 'r6',
        destination: 'https://example.com/pricing#enterprise',
        source: 'newsletter',
        medium: 'email',
        campaign: 'q3_update',
      };
      const url = generateBulkRowUrl(row);
      const passed = url.endsWith('#enterprise') && url.includes('?utm_source=newsletter');
      return { passed, actual: url, expected: 'URL ending in #enterprise after query string' };
    },
  },
  {
    id: 57,
    name: 'Bulk 7: Query + fragment combination',
    description: 'Preserves both existing query parameters and hash fragment in canonical order.',
    run: () => {
      const row = {
        id: 'r7',
        destination: 'https://example.com/page?ref=home#details',
        source: 'partner',
        medium: 'referral',
        campaign: 'co_marketing',
      };
      const url = generateBulkRowUrl(row);
      const passed =
        url.includes('ref=home') &&
        url.includes('utm_source=partner') &&
        url.endsWith('#details');
      return { passed, actual: url, expected: 'Preserved query params and trailing #details' };
    },
  },
  {
    id: 58,
    name: 'Bulk 8: Invalid destination URL',
    description: 'Detects invalid destination URL syntax and marks row as invalid.',
    run: () => {
      const row = {
        id: 'r8',
        destination: 'not a valid url at all',
        source: 'google',
        medium: 'cpc',
        campaign: 'test',
      };
      const val = validateBulkRow(row);
      const passed = !val.isValid && val.errors.some((e) => e.includes('Invalid destination'));
      return { passed, actual: val, expected: 'isValid=false with invalid destination error' };
    },
  },
  {
    id: 59,
    name: 'Bulk 9: Missing source',
    description: 'Flags row as invalid when utm_source is empty.',
    run: () => {
      const row = {
        id: 'r9',
        destination: 'https://example.com',
        source: '',
        medium: 'cpc',
        campaign: 'sale',
      };
      const val = validateBulkRow(row);
      const passed = !val.isValid && val.missingFields.includes('source');
      return { passed, actual: val.missingFields, expected: 'missingFields includes source' };
    },
  },
  {
    id: 60,
    name: 'Bulk 10: Missing medium',
    description: 'Flags row as invalid when utm_medium is empty.',
    run: () => {
      const row = {
        id: 'r10',
        destination: 'https://example.com',
        source: 'google',
        medium: '',
        campaign: 'sale',
      };
      const val = validateBulkRow(row);
      const passed = !val.isValid && val.missingFields.includes('medium');
      return { passed, actual: val.missingFields, expected: 'missingFields includes medium' };
    },
  },
  {
    id: 61,
    name: 'Bulk 11: Missing campaign',
    description: 'Flags row as invalid when utm_campaign is empty.',
    run: () => {
      const row = {
        id: 'r11',
        destination: 'https://example.com',
        source: 'google',
        medium: 'cpc',
        campaign: '',
      };
      const val = validateBulkRow(row);
      const passed = !val.isValid && val.missingFields.includes('campaign');
      return { passed, actual: val.missingFields, expected: 'missingFields includes campaign' };
    },
  },
  {
    id: 62,
    name: 'Bulk 12: Duplicate row behavior',
    description: 'Duplicating a row produces an independent copy with identical values.',
    run: () => {
      const original = EXAMPLE_BULK_ROWS[0];
      const duplicate = { ...original, id: 'copy-1' };
      const urlOrig = generateBulkRowUrl(original);
      const urlDup = generateBulkRowUrl(duplicate);
      const passed = duplicate.id !== original.id && urlOrig === urlDup;
      return { passed, actual: { id: duplicate.id, urlDup }, expected: 'Distinct id with matching URL' };
    },
  },
  {
    id: 63,
    name: 'Bulk 13: CSV parsing basic',
    description: 'Parses standard comma-separated text into structured row records.',
    run: () => {
      const csv = `destination_url,utm_source,utm_medium,utm_campaign\nhttps://example.com,google,cpc,summer_sale`;
      const rawMatrix = parseCsv(csv);
      const res = parseBulkCsv(csv);
      const passed =
        rawMatrix.length === 2 &&
        rawMatrix[1][1] === 'google' &&
        res.rowCount === 1 &&
        res.rows[0].source === 'google' &&
        res.rows[0].campaign === 'summer_sale';
      return { passed, actual: res.rows[0], expected: 'source=google, campaign=summer_sale' };
    },
  },
  {
    id: 64,
    name: 'Bulk 14: CSV quoted comma handling',
    description: 'Preserves commas within quoted fields according to RFC 4180.',
    run: () => {
      const csv = `destination_url,utm_source,utm_medium,utm_campaign,utm_content\n"https://example.com/page?tags=shoes,boots",google,cpc,"summer, autumn sale",banner`;
      const res = parseBulkCsv(csv);
      const passed =
        res.rowCount === 1 &&
        res.rows[0].destination === 'https://example.com/page?tags=shoes,boots' &&
        res.rows[0].campaign === 'summer, autumn sale';
      return { passed, actual: res.rows[0], expected: 'Commas inside quotes preserved' };
    },
  },
  {
    id: 65,
    name: 'Bulk 15: CSV escaped double quotes',
    description: 'Handles escaped double quotes ("") inside quoted fields.',
    run: () => {
      const csv = `destination,source,medium,campaign\nhttps://example.com,google,cpc,"50% ""flash"" sale"`;
      const res = parseBulkCsv(csv);
      const passed = res.rowCount === 1 && res.rows[0].campaign === '50% "flash" sale';
      return { passed, actual: res.rows[0]?.campaign, expected: '50% "flash" sale' };
    },
  },
  {
    id: 66,
    name: 'Bulk 16: CSV blank lines handling',
    description: 'Ignores empty lines and whitespace lines in CSV import.',
    run: () => {
      const csv = `destination,source,medium,campaign\n\nhttps://example.com/1,google,cpc,sale1\n\n  \nhttps://example.com/2,meta,social,sale2\n\n`;
      const res = parseBulkCsv(csv);
      const passed = res.rowCount === 2;
      return { passed, actual: res.rowCount, expected: 2 };
    },
  },
  {
    id: 67,
    name: 'Bulk 17: Mixed valid and invalid rows processing',
    description: 'Correctly isolates valid rows while returning error states for incomplete rows.',
    run: () => {
      const rows = [
        { id: '1', destination: 'https://example.com', source: 'google', medium: 'cpc', campaign: 's1' },
        { id: '2', destination: '', source: 'meta', medium: 'social', campaign: 's2' },
        { id: '3', destination: 'https://example.com', source: 'email', medium: '', campaign: 's3' },
      ];
      const results = processBulkRows(rows);
      const passed =
        results[0].isValid === true &&
        results[0].generatedUrl.length > 0 &&
        results[1].isValid === false &&
        results[1].generatedUrl === '' &&
        results[2].isValid === false;
      return { passed, actual: results.map((r) => r.isValid), expected: [true, false, false] };
    },
  },
  {
    id: 68,
    name: 'Bulk 18: CSV export serialization',
    description: 'Exports generated results to RFC 4180 CSV with correct headers and quotes.',
    run: () => {
      const results = processBulkRows(EXAMPLE_BULK_ROWS);
      const csvOut = exportBulkCsv(results);
      const lines = csvOut.split('\n');
      const passed =
        lines.length === 4 &&
        lines[0].startsWith('destination_url,utm_source') &&
        lines[1].includes('https://example.com/summer-sale?utm_source=google');
      return { passed, actual: lines[0], expected: 'Headers matching destination_url,utm_source...' };
    },
  },
  {
    id: 69,
    name: 'Bulk 19: URL special character encoding in bulk row',
    description: 'Ensures spaces are encoded as %20 (never +) and special characters are safely escaped.',
    run: () => {
      const row = {
        id: 'r19',
        destination: 'https://example.com',
        source: 'google ads',
        medium: 'cpc',
        campaign: 'summer & winter',
        content: '50% off',
      };
      const url = generateBulkRowUrl(row);
      const passed =
        url.includes('utm_source=google%20ads') &&
        url.includes('utm_campaign=summer%20%26%20winter') &&
        url.includes('utm_content=50%25%20off') &&
        !url.includes('+');
      return { passed, actual: url, expected: '%20 for spaces and %26 for &' };
    },
  },
  {
    id: 70,
    name: 'Bulk 20: Presets data integrity',
    description: 'Verifies bulk presets are populated with valid source and medium pairs.',
    run: () => {
      const passed =
        BULK_PRESETS.length === 5 &&
        BULK_PRESETS.some((p) => p.id === 'google_ads' && p.source === 'google' && p.medium === 'cpc') &&
        BULK_PRESETS.some((p) => p.id === 'meta_ads' && p.source === 'meta' && p.medium === 'paid_social');
      return { passed, actual: BULK_PRESETS.length, expected: 5 };
    },
  },
];

export function runTests(): { total: number; passed: number; failed: number } {
  console.log('--- Running UTM Suite Deterministic Tests (Checker, Builder, Parser, Naming, Bulk) ---');
  let passed = 0;
  let failed = 0;

  console.log('\n[Part 1: UTM Checker Validation Cases 1-14]');
  for (const tc of validationTestCases) {
    const parsed = parseUtmUrl(tc.input);
    const result = validateUtmUrl(parsed);
    const success = tc.assert(result);

    if (success) {
      console.log(`✓ Case ${tc.id}: ${tc.name}`);
      passed++;
    } else {
      console.error(`✗ Case ${tc.id}: ${tc.name} FAILED!`);
      console.error(`  Input: ${tc.input}`);
      console.error(`  Issues:`, result.issues);
      failed++;
    }
  }

  console.log('\n[Part 2: UTM Builder Cases 15-24]');
  for (const tc of builderTestCases) {
    const res = tc.run();
    if (res.passed) {
      console.log(`✓ Case ${tc.id}: ${tc.name}`);
      passed++;
    } else {
      console.error(`✗ Case ${tc.id}: ${tc.name} FAILED!`);
      console.error(`  Expected: ${res.expected}`);
      console.error(`  Actual:   ${res.actual}`);
      failed++;
    }
  }

  console.log('\n[Part 3: UTM Parser Cases 25-36]');
  for (const tc of parserTestCases) {
    const res = tc.run();
    if (res.passed) {
      console.log(`✓ Case ${tc.id}: ${tc.name}`);
      passed++;
    } else {
      console.error(`✗ Case ${tc.id}: ${tc.name} FAILED!`);
      console.error(`  Expected: ${JSON.stringify(res.expected)}`);
      console.error(`  Actual:   ${JSON.stringify(res.actual)}`);
      failed++;
    }
  }

  console.log('\n[Part 4: UTM Naming Generator Cases 37-50]');
  for (const tc of namingTestCases) {
    const res = tc.run();
    if (res.passed) {
      console.log(`✓ Case ${tc.id}: ${tc.name}`);
      passed++;
    } else {
      console.error(`✗ Case ${tc.id}: ${tc.name} FAILED!`);
      console.error(`  Expected: ${JSON.stringify(res.expected)}`);
      console.error(`  Actual:   ${JSON.stringify(res.actual)}`);
      failed++;
    }
  }

  console.log('\n[Part 5: Bulk UTM Builder Cases 51-70]');
  for (const tc of bulkTestCases) {
    const res = tc.run();
    if (res.passed) {
      console.log(`✓ Case ${tc.id}: ${tc.name}`);
      passed++;
    } else {
      console.error(`✗ Case ${tc.id}: ${tc.name} FAILED!`);
      console.error(`  Expected: ${JSON.stringify(res.expected)}`);
      console.error(`  Actual:   ${JSON.stringify(res.actual)}`);
      failed++;
    }
  }

  const total =
    validationTestCases.length +
    builderTestCases.length +
    parserTestCases.length +
    namingTestCases.length +
    bulkTestCases.length;
  console.log(`\nSummary: ${passed}/${total} passed (${failed} failed).`);
  return { total, passed, failed };
}

// Self-run when executed directly via Node.js
runTests();

