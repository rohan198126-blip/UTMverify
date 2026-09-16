import { buildUtmUrl } from './build.ts';
import type {
  BulkUtmRow,
  BulkRowValidation,
  BulkUtmResult,
  BulkPreset,
  BulkCsvImportResult,
} from './types.ts';

/**
 * Standard presets to quickly populate source and medium in the bulk builder.
 */
export const BULK_PRESETS: BulkPreset[] = [
  { id: 'google_ads', nameKey: 'bulk.presetGoogleAds', source: 'google', medium: 'cpc' },
  { id: 'meta_ads', nameKey: 'bulk.presetMetaAds', source: 'meta', medium: 'paid_social' },
  { id: 'email', nameKey: 'bulk.presetEmail', source: 'newsletter', medium: 'email' },
  { id: 'organic_social', nameKey: 'bulk.presetOrganicSocial', source: 'social', medium: 'organic_social' },
  { id: 'linkedin', nameKey: 'bulk.presetLinkedIn', source: 'linkedin', medium: 'cpc' },
];

/**
 * Fictional example rows for demonstrating bulk URL generation.
 */
export const EXAMPLE_BULK_ROWS: BulkUtmRow[] = [
  {
    id: 'ex-1',
    destination: 'https://example.com/summer-sale',
    source: 'google',
    medium: 'cpc',
    campaign: 'summer_sale',
    content: 'search_ad',
  },
  {
    id: 'ex-2',
    destination: 'https://example.com/summer-sale',
    source: 'meta',
    medium: 'paid_social',
    campaign: 'summer_sale',
    content: 'instagram_video',
  },
  {
    id: 'ex-3',
    destination: 'https://example.com/summer-sale',
    source: 'newsletter',
    medium: 'email',
    campaign: 'summer_sale',
    content: 'july_newsletter',
  },
];

/**
 * Checks whether a given destination URL string looks syntactically plausible.
 * Supports full URLs (https://example.com) and protocol-less paths (example.com/page).
 */
export function isValidDestinationUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  // Reject literal whitespace in the hostname part
  const firstPart = trimmed.split(/[/?#]/)[0];
  if (/\s/.test(firstPart)) return false;

  const urlString = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(urlString);
    if (!parsed.hostname) return false;
    // Must be localhost or contain a period (e.g. domain.com)
    return parsed.hostname === 'localhost' || parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Validates a single bulk row independently.
 */
export function validateBulkRow(row: BulkUtmRow): BulkRowValidation {
  const errors: string[] = [];
  const missingFields: Array<'destination' | 'source' | 'medium' | 'campaign'> = [];

  const dest = (row.destination || '').trim();
  const src = (row.source || '').trim();
  const med = (row.medium || '').trim();
  const camp = (row.campaign || '').trim();

  if (!dest) {
    missingFields.push('destination');
    errors.push('Destination URL is required.');
  } else if (!isValidDestinationUrl(dest)) {
    errors.push('Invalid destination URL format.');
  }

  if (!src) {
    missingFields.push('source');
    errors.push('utm_source is required.');
  }

  if (!med) {
    missingFields.push('medium');
    errors.push('utm_medium is required.');
  }

  if (!camp) {
    missingFields.push('campaign');
    errors.push('utm_campaign is required.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingFields,
  };
}

/**
 * Builds the tagged campaign URL for a single bulk row using the shared buildUtmUrl engine.
 */
export function generateBulkRowUrl(row: BulkUtmRow): string {
  const validation = validateBulkRow(row);
  if (!validation.isValid) {
    return '';
  }

  return buildUtmUrl({
    baseUrl: row.destination.trim(),
    params: {
      utm_source: (row.source || '').trim(),
      utm_medium: (row.medium || '').trim(),
      utm_campaign: (row.campaign || '').trim(),
      utm_term: (row.term || '').trim() || undefined,
      utm_content: (row.content || '').trim() || undefined,
    },
    preserveExistingParams: true,
    lowercaseParams: false,
  });
}

/**
 * Processes an array of bulk rows, generating validation outcomes and final URLs.
 */
export function processBulkRows(rows: BulkUtmRow[]): BulkUtmResult[] {
  return rows.map((row, index) => {
    const validation = validateBulkRow(row);
    const generatedUrl = validation.isValid ? generateBulkRowUrl(row) : '';

    return {
      rowId: row.id,
      rowNumber: index + 1,
      row,
      generatedUrl,
      isValid: validation.isValid,
      errors: validation.errors,
      missingFields: validation.missingFields,
    };
  });
}

/**
 * Robust RFC 4180-compliant CSV parser.
 * Handles quoted fields, embedded commas, escaped quotes (""), and varied newlines.
 */
export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  if (!csvText || !csvText.trim()) {
    return rows;
  }

  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && csvText[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        currentField = '';
        // Only push row if it contains at least one non-empty field
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Flush remaining field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses raw CSV text into BulkUtmRow objects with header detection.
 */
export function parseBulkCsv(csvText: string): BulkCsvImportResult {
  const parsedRows = parseCsv(csvText);
  if (parsedRows.length === 0) {
    return { rows: [], rowCount: 0, errors: ['No CSV data found.'] };
  }

  const firstRow = parsedRows[0];
  const firstRowLower = firstRow.map((c) => c.toLowerCase());

  // Check if first row is a header
  const isHeader =
    firstRowLower.some((c) => c.includes('destination') || c.includes('url') || c.includes('link')) ||
    firstRowLower.some((c) => c.includes('utm_source') || c.includes('source'));

  let colMap = {
    dest: 0,
    source: 1,
    medium: 2,
    campaign: 3,
    term: 4,
    content: 5,
  };

  let dataRows = parsedRows;

  if (isHeader) {
    dataRows = parsedRows.slice(1);
    // Find column positions dynamically
    firstRowLower.forEach((col, idx) => {
      if (col.includes('destination') || (col.includes('url') && !col.includes('utm')) || col.includes('link')) {
        colMap.dest = idx;
      } else if (col.includes('source')) {
        colMap.source = idx;
      } else if (col.includes('medium')) {
        colMap.medium = idx;
      } else if (col.includes('campaign')) {
        colMap.campaign = idx;
      } else if (col.includes('term')) {
        colMap.term = idx;
      } else if (col.includes('content')) {
        colMap.content = idx;
      }
    });
  }

  const rows: BulkUtmRow[] = [];
  dataRows.forEach((row, idx) => {
    const dest = row[colMap.dest] || '';
    const src = row[colMap.source] || '';
    const med = row[colMap.medium] || '';
    const camp = row[colMap.campaign] || '';
    const term = row[colMap.term] || '';
    const content = row[colMap.content] || '';

    // Ignore completely empty lines
    if (!dest && !src && !med && !camp && !term && !content) {
      return;
    }

    rows.push({
      id: `imported-${Date.now()}-${idx + 1}`,
      destination: dest,
      source: src,
      medium: med,
      campaign: camp,
      term: term || undefined,
      content: content || undefined,
    });
  });

  return {
    rows,
    rowCount: rows.length,
    errors: rows.length === 0 ? ['No valid rows could be extracted from the CSV.'] : [],
  };
}

/**
 * Escapes an individual field for RFC 4180 CSV export.
 */
export function escapeCsvField(val: string | undefined): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports generated bulk URL results to a clean, standard CSV string.
 * Only includes valid rows with generated URLs.
 */
export function exportBulkCsv(results: BulkUtmResult[]): string {
  const headers = [
    'destination_url',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'generated_url',
  ];

  const lines = [headers.join(',')];

  for (const r of results) {
    if (r.isValid && r.generatedUrl) {
      const line = [
        escapeCsvField(r.row.destination),
        escapeCsvField(r.row.source),
        escapeCsvField(r.row.medium),
        escapeCsvField(r.row.campaign),
        escapeCsvField(r.row.term || ''),
        escapeCsvField(r.row.content || ''),
        escapeCsvField(r.generatedUrl),
      ].join(',');
      lines.push(line);
    }
  }

  return lines.join('\n');
}
