import {
  type NamingInput,
  type NamingPresetId,
  type NamingPresetDefinition,
  type NamingBreakdownItem,
  type SuggestedUtmValues,
  type GeneratedNaming,
} from './types.ts';

/**
 * Standard naming presets for UTM campaign conventions.
 */
export const NAMING_PRESETS: NamingPresetDefinition[] = [
  {
    id: 'simple',
    nameKey: 'naming.presetSimple',
    descriptionKey: 'naming.presetSimpleDesc',
    pattern: 'campaign_source_medium',
    fields: ['campaign', 'source', 'medium'],
  },
  {
    id: 'source_first',
    nameKey: 'naming.presetSourceFirst',
    descriptionKey: 'naming.presetSourceFirstDesc',
    pattern: 'source_medium_campaign',
    fields: ['source', 'medium', 'campaign'],
  },
  {
    id: 'campaign_first',
    nameKey: 'naming.presetCampaignFirst',
    descriptionKey: 'naming.presetCampaignFirstDesc',
    pattern: 'campaign_objective_source_medium',
    fields: ['campaign', 'objective', 'source', 'medium'],
  },
  {
    id: 'full',
    nameKey: 'naming.presetFull',
    descriptionKey: 'naming.presetFullDesc',
    pattern: 'campaign_source_medium_objective_audience_creative_period',
    fields: ['campaign', 'source', 'medium', 'objective', 'audience', 'creative', 'period'],
  },
];

/**
 * Normalizes an individual naming segment into a clean, lowercase, alphanumeric identifier.
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Converts spaces and delimiters (/, |, +, ,, ;) to separators (_)
 * - Strips unnecessary punctuation
 * - Safely collapses repeated separators
 * - Preserves meaningful numbers and date hyphens
 * - Removes leading and trailing separators
 */
export function normalizeNamingSegment(input: string, separator: string = '_'): string {
  if (!input) return '';
  let str = input.trim().toLowerCase();
  if (!str) return '';

  // Replace whitespace sequences and common divider symbols with separator
  str = str.replace(/[\s/|+;,]+/g, separator);

  // Strip unwanted punctuation characters (!, @, #, $, %, ^, &, *, (, ), =, [, ], {, }, :, ", ', <, >, ?, \, ~, `)
  // Retaining word chars (a-z, 0-9, _) and hyphens (-)
  str = str.replace(/[^\w-]/g, '');

  // Collapse consecutive underscores
  str = str.replace(/_+/g, '_');

  // Collapse consecutive hyphens
  str = str.replace(/-+/g, '-');

  // Avoid mixed duplicate separators like '_-' or '-_'
  str = str.replace(/[_-]{2,}/g, '_');

  // Strip leading and trailing underscores or hyphens
  str = str.replace(/^[_-]+|[_-]+$/g, '');

  return str;
}

/**
 * Generates a consistent campaign name from structured inputs according to the chosen preset.
 */
export function generateCampaignName(input: NamingInput, presetId: NamingPresetId = 'full'): string {
  const preset = NAMING_PRESETS.find((p) => p.id === presetId) || NAMING_PRESETS[3];
  const parts: string[] = [];

  for (const field of preset.fields) {
    const rawVal = input[field];
    if (rawVal) {
      const normalized = normalizeNamingSegment(rawVal);
      if (normalized) {
        parts.push(normalized);
      }
    }
  }

  return parts.join('_');
}

/**
 * Generates suggested individual UTM parameters based on the inputs and the generated campaign name.
 */
export function generateSuggestedUtmValues(input: NamingInput, campaignName: string): SuggestedUtmValues {
  const normSource = normalizeNamingSegment(input.source || '');
  const normMedium = normalizeNamingSegment(input.medium || '');
  const normAudience = normalizeNamingSegment(input.audience || '');
  const normCreative = normalizeNamingSegment(input.creative || '');

  const result: SuggestedUtmValues = {
    utm_source: normSource,
    utm_medium: normMedium,
    utm_campaign: campaignName,
  };

  if (normAudience) {
    result.utm_term = normAudience;
  }

  if (normCreative) {
    result.utm_content = normCreative;
  }

  return result;
}

/**
 * Complete naming generator pipeline producing the campaign name, breakdown items,
 * and suggested UTM values.
 */
export function generateNaming(input: NamingInput, presetId: NamingPresetId = 'full'): GeneratedNaming {
  const campaignName = generateCampaignName(input, presetId);
  const suggestedUtm = generateSuggestedUtmValues(input, campaignName);

  const fieldKeys: Array<keyof NamingInput> = [
    'campaign',
    'source',
    'medium',
    'objective',
    'audience',
    'creative',
    'period',
  ];

  const breakdown: NamingBreakdownItem[] = [];
  let hasInput = false;

  for (const key of fieldKeys) {
    const raw = input[key];
    if (raw && raw.trim()) {
      hasInput = true;
      const normalized = normalizeNamingSegment(raw);
      if (normalized) {
        breakdown.push({
          key,
          labelKey: `naming.field${key.charAt(0).toUpperCase() + key.slice(1)}`,
          raw: raw.trim(),
          normalized,
        });
      }
    }
  }

  return {
    campaignName,
    preset: presetId,
    breakdown,
    suggestedUtm,
    hasInput,
  };
}
