export interface SiteConfig {
  name: string;
  domain: string;
  url: string;
  tagline: string;
  description: string;
}

export const siteConfig: SiteConfig = {
  name: 'UTMVerify',
  domain: 'utmverify.com',
  url: 'https://utmverify.com',
  tagline: 'Simple tools for better campaign tracking',
  description: 'Fast, clean, client-side UTM utilities. Validate, build, parse, and standardize campaign URLs with precision.',
};

export interface ToolMeta {
  title: string;
  description: string;
  path: string;
  name: string;
  shortDescription: string;
}

export const TOOLS: Record<string, ToolMeta> = {
  checker: {
    name: 'UTM Checker',
    path: '/utm-checker',
    title: 'UTM Checker | Verify Campaign URL Parameters - UTMVerify',
    description: 'Instantly check and validate UTM parameters in campaign URLs. Detect missing tags, formatting issues, and duplicate parameters in your browser.',
    shortDescription: 'Validate UTM tags, detect errors, and check campaign URLs instantly.',
  },
  builder: {
    name: 'UTM Builder',
    path: '/utm-builder',
    title: 'UTM Builder | Generate Clean Campaign URLs - UTMVerify',
    description: 'Construct consistent, properly formatted UTM campaign tracking URLs with automatic encoding, standard parameter fields, and live link verification.',
    shortDescription: 'Construct clean, properly encoded campaign URLs with ease.',
  },
  parser: {
    name: 'UTM Parser',
    path: '/utm-parser',
    title: 'UTM Parser | Inspect & Deconstruct URLs - UTMVerify',
    description: 'Break down complex tracking URLs into individual UTM components and query strings for instant browser inspection with zero external data transmission.',
    shortDescription: 'Deconstruct tracking links into clean parameter breakdowns.',
  },
  naming: {
    name: 'UTM Naming Generator',
    path: '/utm-naming-generator',
    title: 'UTM Naming Generator | Standardize Campaign Names - UTMVerify',
    description: 'Generate standardized, convention-compliant UTM naming structures across sources, mediums, and campaigns to keep your marketing analytics clean.',
    shortDescription: 'Standardize campaign naming conventions across your team.',
  },
  bulk: {
    name: 'Bulk UTM Builder',
    path: '/bulk-utm-builder',
    title: 'Bulk UTM Builder | Batch Generate Tracking Links - UTMVerify',
    description: 'Generate and validate multiple UTM campaign links simultaneously without spreadsheets or external servers. Fast, batch link generation in your browser.',
    shortDescription: 'Batch generate dozens of tagged campaign URLs in seconds.',
  },
};
