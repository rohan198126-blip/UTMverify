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
  const urls: string[] = [];

  for (const p of PATHS) {
    for (const locale of SUPPORTED_LOCALES) {
      const locPath = p ? `${locale}/${p}` : `${locale}/`;
      const fullUrl = `${SITE_URL}/${locPath}`;

      // Alternate hreflang tags for each language + x-default
      const alternates = SUPPORTED_LOCALES.map((l) => {
        const altPath = p ? `${l}/${p}` : `${l}/`;
        return `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}/${altPath}" />`;
      });
      const defaultAlt = `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/en/${p ? p : ''}" />`;

      urls.push(`  <url>
    <loc>${fullUrl}</loc>
${alternates.join('\n')}
${defaultAlt}
    <changefreq>weekly</changefreq>
    <priority>${p === '' || p.startsWith('utm-') ? '0.9' : '0.7'}</priority>
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
