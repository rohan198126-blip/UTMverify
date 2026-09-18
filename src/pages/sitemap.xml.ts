import type { APIRoute } from 'astro';
import { SUPPORTED_LOCALES } from '../i18n/ui';

const SITE_URL = 'https://utmverify.com';

const PATHS = [
  '',
  'utm-checker',
  'utm-builder',
  'utm-parser',
  'utm-naming-generator',
  'bulk-utm-builder',
  'guides',
  'about',
  'privacy',
  'terms',
  'contact',
];

export const GET: APIRoute = () => {
  const urlEntries: string[] = [];

  for (const p of PATHS) {
    for (const locale of SUPPORTED_LOCALES) {
      const locPath = p ? `${locale}/${p}` : `${locale}/`;
      const fullUrl = `${SITE_URL}/${locPath}`;

      urlEntries.push(`  <url>\n    <loc>${fullUrl}</loc>\n  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

