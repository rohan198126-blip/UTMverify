import { parseUtmUrl, parseCampaignUrl } from './parse.ts';
import { validateUtmUrl } from './validate.ts';
import { buildUtmUrl } from './build.ts';

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

export function runTests(): { total: number; passed: number; failed: number } {
  console.log('--- Running UTM Suite Deterministic Tests (Checker, Builder, Parser) ---');
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

  const total = validationTestCases.length + builderTestCases.length + parserTestCases.length;
  console.log(`\nSummary: ${passed}/${total} passed (${failed} failed).`);
  return { total, passed, failed };
}

// Self-run when executed directly via Node.js
runTests();

