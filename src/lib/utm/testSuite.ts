import { parseUtmUrl } from './parse.ts';
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

export function runTests(): { total: number; passed: number; failed: number } {
  console.log('--- Running UTM Validation & Builder Deterministic Test Suite ---');
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

  const total = validationTestCases.length + builderTestCases.length;
  console.log(`\nSummary: ${passed}/${total} passed (${failed} failed).`);
  return { total, passed, failed };
}

// Self-run when executed directly via Node.js
runTests();
