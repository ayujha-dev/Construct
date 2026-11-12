/**
 * Faithful JavaScript illustration of the deterministic verification gate in
 * `apps/api/bert/verification/citation_gate.py`.
 *
 * Backend production checks run `rapidfuzz.fuzz.partial_ratio >= 97.0`,
 * `assess_quote_strength` (min 24 chars, min 4 words, bare-title rejection),
 * and critical-entity logprob >= 0.92.
 */

export const GATE_CITATION_THRESHOLD = 97.0;
export const GATE_MIN_QUOTE_CHARS = 24;
export const GATE_MIN_QUOTE_WORDS = 4;

export type GateOutcomeStatus = "PASS" | "WEAK_EVIDENCE" | "FAIL";

export interface GateEvaluationResult {
  score: number;
  threshold: number;
  status: GateOutcomeStatus;
  statusBadge: string;
  headline: string;
  reasons: string[];
  normalizedQuote: string;
  charCount: number;
  wordCount: number;
  isBareTitle: boolean;
}

const TITLE_CONNECTORS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into",
  "of", "on", "or", "the", "to", "with", "type", "ii", "iii", "iv", "v",
]);

const CLAUSE_VERBS = new Set([
  "is", "are", "was", "were", "be", "must", "shall", "should", "may",
  "will", "can", "requires", "require", "enforces", "enforce", "uses",
  "use", "applies", "apply", "mandates", "mandate", "retains", "retain",
  "retained", "rotated", "encrypted", "archived", "prohibits", "prohibit",
  "contains", "contain", "permits", "permit",
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Computes RapidFuzz-equivalent Indel similarity ratio:
 * `100 * (lenA + lenB - indelDistance) / (lenA + lenB)`
 * where `indelDistance = lenA + lenB - 2 * LCS(a, b)`.
 */
export function indelRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 100;
  if (!a.length || !b.length) return 0;

  const n = a.length;
  const m = b.length;
  let prev = new Uint16Array(m + 1);
  let curr = new Uint16Array(m + 1);

  for (let i = 1; i <= n; i++) {
    curr[0] = 0;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      if (ca === b.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = prev[j] >= curr[j - 1] ? prev[j] : curr[j - 1];
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  const lcs = prev[m];
  return (2 * lcs * 100) / (n + m);
}

/**
 * Computes sliding-window partial ratio matching `rapidfuzz.fuzz.partial_ratio`.
 */
export function partialRatio(quote: string, source: string): number {
  const q = normalizeWhitespace(quote);
  const s = normalizeWhitespace(source);
  if (!q || !s) return 0;
  if (s.includes(q) || q.includes(s)) return 100;

  const shorter = q.length <= s.length ? q : s;
  const longer = q.length <= s.length ? s : q;
  const winLen = shorter.length;

  let best = indelRatio(shorter, longer);
  if (longer.length <= winLen) return Math.round(best * 10) / 10;

  for (let start = 0; start <= longer.length - winLen; start++) {
    const windowSlice = longer.slice(start, start + winLen);
    const score = indelRatio(shorter, windowSlice);
    if (score > best) {
      best = score;
      if (best >= 99.95) break;
    }
  }

  return Math.round(best * 10) / 10;
}

export function isBareHeaderOrTitle(normalized: string, words: string[]): boolean {
  if (!words.length) return false;
  if (normalized.includes("|") || (normalized.includes(":") && !normalized.startsWith("#"))) {
    return false;
  }
  if (/[.!?]$/.test(normalized)) {
    return false;
  }
  if (normalized.startsWith("#")) {
    return true;
  }
  if (/^(?:section|appendix|article|chapter)\s+\d+(?:\.\d+)*/i.test(normalized)) {
    if (
      words.length <= 10 &&
      !words.some((w) => CLAUSE_VERBS.has(w.toLowerCase().replace(/[.,;:]/g, "")))
    ) {
      return true;
    }
  }

  const alphaWords = words
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (!alphaWords.length) return false;

  const lettersOnly = normalized.replace(/[^A-Za-z]/g, "");
  if (lettersOnly && lettersOnly === lettersOnly.toUpperCase() && words.length <= 12) {
    return true;
  }

  if (
    words.length <= 10 &&
    !alphaWords.some((w) => CLAUSE_VERBS.has(w.toLowerCase()))
  ) {
    const significant = alphaWords.filter(
      (w) => !TITLE_CONNECTORS.has(w.toLowerCase()) && !/^\d+$/.test(w)
    );
    if (significant.length > 0 && significant.every((w) => /^[A-Z]/.test(w))) {
      return true;
    }
  }

  return false;
}

export function assessQuoteStrength(quote: string): {
  isWeak: boolean;
  reasons: string[];
  charCount: number;
  wordCount: number;
  isBareTitle: boolean;
} {
  const normalized = normalizeWhitespace(quote);
  if (!normalized) {
    return {
      isWeak: false,
      reasons: [],
      charCount: 0,
      wordCount: 0,
      isBareTitle: false,
    };
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const reasons: string[] = [];

  if (normalized.length < GATE_MIN_QUOTE_CHARS) {
    reasons.push(`quote length ${normalized.length} chars < minimum ${GATE_MIN_QUOTE_CHARS}`);
  }
  if (words.length < GATE_MIN_QUOTE_WORDS) {
    reasons.push(`quote word count ${words.length} < minimum ${GATE_MIN_QUOTE_WORDS}`);
  }
  const bareTitle = isBareHeaderOrTitle(normalized, words);
  if (bareTitle) {
    reasons.push("bare heading or document title without substantive evidence");
  }

  return {
    isWeak: reasons.length > 0,
    reasons,
    charCount: normalized.length,
    wordCount: words.length,
    isBareTitle: bareTitle,
  };
}

export function evaluateVerificationGate(
  quote: string,
  sourceSentence: string,
  threshold: number = GATE_CITATION_THRESHOLD
): GateEvaluationResult {
  const normalizedQuote = normalizeWhitespace(quote);
  const normalizedSource = normalizeWhitespace(sourceSentence);
  const strength = assessQuoteStrength(normalizedQuote);

  if (!normalizedQuote) {
    return {
      score: 0,
      threshold,
      status: "FAIL",
      statusBadge: "FAIL · Empty Quote",
      headline: "Blocked at verification gate — missing verbatim quote",
      reasons: ["No candidate quote provided; Envoy refuses prose synthesis."],
      normalizedQuote: "",
      charCount: 0,
      wordCount: 0,
      isBareTitle: false,
    };
  }

  const score = partialRatio(normalizedQuote, normalizedSource);

  if (score < threshold) {
    return {
      score,
      threshold,
      status: "FAIL",
      statusBadge: "FAIL · Below 97% Gate",
      headline: `Match score ${score.toFixed(1)}% < ${threshold.toFixed(0)}% threshold — flagged for human review`,
      reasons: [
        `Similarity score ${score.toFixed(1)}% failed the deterministic >=${threshold.toFixed(0)}% verbatim quote gate.`,
        "Routes to /triage as INSUFFICIENT_EVIDENCE (P0_CRITICAL).",
      ],
      normalizedQuote,
      charCount: strength.charCount,
      wordCount: strength.wordCount,
      isBareTitle: strength.isBareTitle,
    };
  }

  if (strength.isWeak) {
    return {
      score,
      threshold,
      status: "WEAK_EVIDENCE",
      statusBadge: "WEAK EVIDENCE · Human Check",
      headline: "Quote matched source text, but failed specificity rules",
      reasons: strength.reasons,
      normalizedQuote,
      charCount: strength.charCount,
      wordCount: strength.wordCount,
      isBareTitle: strength.isBareTitle,
    };
  }

  return {
    score,
    threshold,
    status: "PASS",
    statusBadge: "PASS · Gate Verified",
    headline: `Verified (${score.toFixed(1)}% >= ${threshold.toFixed(0)}%) — eligible for Envoy synthesis`,
    reasons: [
      `Verbatim match ${score.toFixed(1)}% clears >=${threshold.toFixed(0)}% gate.`,
      `Specificity check passed (${strength.charCount} chars, ${strength.wordCount} words, substantive clause).`,
    ],
    normalizedQuote,
    charCount: strength.charCount,
    wordCount: strength.wordCount,
    isBareTitle: strength.isBareTitle,
  };
}
