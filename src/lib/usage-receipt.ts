/**
 * usage-receipt.ts — Usage receipt by model & nanodollar cost accounting
 *
 * Implements token grouping and cost calculation based on Paperclip (MIT) logic:
 * - Cache-creation input tokens are billed as input prompt tokens and added to inputTokens.
 * - Cache-read input tokens are kept separate as cachedInputTokens.
 * - Output tokens are kept separate as outputTokens.
 * - Cost in nanodollars (10^9 per USD) is parsed using money.ts integer arithmetic.
 * - Missing or invalid total_cost_usd produces { costNanodollars: null, priced: false }.
 */

import { usdToUnits } from './money';

export interface ModelReceipt {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  totalCostUsd?: string;
  costNanodollars: number | null;
  priced: boolean;
}

export interface StreamJsonEvent {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  total_cost_usd?: unknown;
  model?: unknown;
  usage?: Record<string, unknown>;
  modelUsage?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Parse an NDJSON stream-json string into an array of event objects.
 */
export function parseStreamJsonLines(rawOutput: string): StreamJsonEvent[] {
  const events: StreamJsonEvent[] = [];
  const lines = rawOutput.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        events.push(obj as StreamJsonEvent);
      }
    } catch {
      /* ignore invalid JSON lines */
    }
  }
  return events;
}

interface ExtractionOptions {
  /** Test hook for positive control: if true, skips adding cache creation tokens to inputTokens */
  skipCacheCreationAddition?: boolean;
}

/**
 * Extract per-model usage receipts from stream-json events or raw NDJSON string.
 */
export function extractUsageReceipts(
  input: StreamJsonEvent[] | string,
  options?: ExtractionOptions
): ModelReceipt[] {
  const events = typeof input === 'string' ? parseStreamJsonLines(input) : input;
  const resultEvent = events.find((e) => e && e.type === 'result');

  if (!resultEvent) {
    return [];
  }

  const receipts: ModelReceipt[] = [];
  const skipAddition = options?.skipCacheCreationAddition === true;

  // 1. Try modelUsage first (most authoritative per-model ledger)
  const modelUsage = resultEvent.modelUsage;
  if (modelUsage && typeof modelUsage === 'object' && Object.keys(modelUsage).length > 0) {
    for (const [model, rawEntry] of Object.entries(modelUsage)) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;

      const rawInput = Number(rawEntry.inputTokens ?? rawEntry.input_tokens ?? 0) || 0;
      const cacheCreation = Number(rawEntry.cacheCreationInputTokens ?? rawEntry.cache_creation_input_tokens ?? 0) || 0;
      const cachedInput = Number(rawEntry.cacheReadInputTokens ?? rawEntry.cache_read_input_tokens ?? 0) || 0;
      const output = Number(rawEntry.outputTokens ?? rawEntry.output_tokens ?? 0) || 0;

      const inputTokens = skipAddition ? rawInput : rawInput + cacheCreation;

      // Extract cost
      const rawCost = rawEntry.costUSD ?? rawEntry.cost_usd ?? (
        Object.keys(modelUsage).length === 1 ? resultEvent.total_cost_usd : undefined
      );

      let costNanodollars: number | null = null;
      let totalCostUsd: string | undefined = undefined;
      let priced = false;

      if (typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0) {
        totalCostUsd = String(rawCost);
        try {
          const units = usdToUnits(totalCostUsd);
          costNanodollars = Number(units);
          priced = true;
        } catch {
          costNanodollars = null;
          priced = false;
        }
      }

      receipts.push({
        model,
        inputTokens,
        cachedInputTokens: cachedInput,
        cacheCreationTokens: cacheCreation,
        outputTokens: output,
        ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
        costNanodollars,
        priced,
      });
    }

    if (receipts.length > 0) {
      return receipts;
    }
  }

  // 2. Fallback to top-level usage object
  const usage = resultEvent.usage;
  if (usage && typeof usage === 'object') {
    const rawInput = Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0;
    const cacheCreation = Number(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens ?? 0) || 0;
    const cachedInput = Number(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? 0) || 0;
    const output = Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0;

    const inputTokens = skipAddition ? rawInput : rawInput + cacheCreation;
    const model = typeof resultEvent.model === 'string' && resultEvent.model
      ? resultEvent.model
      : 'claude-default';

    const rawCost = resultEvent.total_cost_usd;
    let costNanodollars: number | null = null;
    let totalCostUsd: string | undefined = undefined;
    let priced = false;

    if (typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0) {
      totalCostUsd = String(rawCost);
      try {
        const units = usdToUnits(totalCostUsd);
        costNanodollars = Number(units);
        priced = true;
      } catch {
        costNanodollars = null;
        priced = false;
      }
    }

    receipts.push({
      model,
      inputTokens,
      cachedInputTokens: cachedInput,
      cacheCreationTokens: cacheCreation,
      outputTokens: output,
      ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
      costNanodollars,
      priced,
    });
  }

  return receipts;
}
