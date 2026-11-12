export type StorySectionId =
  | "evidence-demo"
  | "pipeline-explorer"
  | "verification-gate"
  | "risk-tiers"
  | "triage-preview"
  | "use-cases";

export interface StoryNavItem {
  id: StorySectionId;
  shortLabel: string;
  label: string;
  step: string;
}

export const STORY_NAV_ITEMS: StoryNavItem[] = [
  { id: "evidence-demo", step: "01", shortLabel: "Evidence", label: "Evidence Demo" },
  { id: "pipeline-explorer", step: "02", shortLabel: "Pipeline", label: "7-Agent Pipeline" },
  { id: "verification-gate", step: "03", shortLabel: "Gate", label: "Verification Gate" },
  { id: "risk-tiers", step: "04", shortLabel: "Tiers", label: "Risk Tiers" },
  { id: "triage-preview", step: "05", shortLabel: "Triage", label: "Triage Preview" },
  { id: "use-cases", step: "06", shortLabel: "Use Cases", label: "Use Cases" },
];

export interface HeroClaimDemo {
  id: "hero-pdf" | "hero-json" | "hero-xlsx";
  format: "PDF" | "JSON" | "XLSX";
  claimChip: string;
  claimText: string;
  sourceFile: string;
  locationLabel: string;
  matchBadge: string;
  pdfPreview?: {
    pageNumber: number;
    sectionHeading: string;
    linesBefore: string;
    highlightedLine: string;
    linesAfter: string;
    bboxLabel: string;
    bboxPercent: { left: number; top: number; width: number; height: number };
  };
  jsonPreview?: {
    jsonPath: string;
    lines: Array<{ text: string; isTarget?: boolean }>;
  };
  xlsxPreview?: {
    sheetName: string;
    targetRow: number;
    headers: string[];
    rows: Array<{ rowNum: number; cells: string[]; isTarget?: boolean }>;
  };
}

export const HERO_CLAIM_DEMOS: HeroClaimDemo[] = [
  {
    id: "hero-pdf",
    format: "PDF",
    claimChip: "MFA Enforcement",
    claimText:
      "Access control requires multifactor authentication for all privileged accounts across production environments.",
    sourceFile: "SOC2_Type_II_2026.pdf",
    locationLabel: "Page 14 · bbox [72, 610, 512, 636]",
    matchBadge: "99.4% rapidfuzz match",
    pdfPreview: {
      pageNumber: 14,
      sectionHeading: "SECTION 4.2 · LOGICAL ACCESS CONTROLS",
      linesBefore:
        "Privileged IAM roles are reviewed quarterly by Security Operations and logged in the immutable audit ledger.",
      highlightedLine:
        "Access control requires multifactor authentication for all privileged accounts across production environments.",
      linesAfter:
        "Exceptions require CISO sign-off with a 30-day expiry window and compensating network isolation.",
      bboxLabel: "bbox [72, 610, 512, 636]",
      bboxPercent: { left: 4, top: 41, width: 92, height: 24 },
    },
  },
  {
    id: "hero-json",
    format: "JSON",
    claimChip: "IAM Wildcard s3:*",
    claimText:
      "Production IAM policy grants Effect Allow with wildcard action s3:* on resource *.",
    sourceFile: "aws_iam_prod_config.json",
    locationLabel: "$.rules.wildcard-admin.action",
    matchBadge: "100.0% JSONPath anchor",
    jsonPreview: {
      jsonPath: "$.rules.wildcard-admin.action",
      lines: [
        { text: '{ "rules": {' },
        { text: '    "wildcard-admin": {' },
        { text: '      "effect": "Allow",' },
        { text: '      "action": "s3:*",', isTarget: true },
        { text: '      "resource": "*"' },
        { text: "    }" },
        { text: "} }" },
      ],
    },
  },
  {
    id: "hero-xlsx",
    format: "XLSX",
    claimChip: "Password Length 14",
    claimText:
      "Minimum password length is 14 characters per 2026 SOC 2 policy (superseding 2023 rule).",
    sourceFile: "Enterprise_Security_Questionnaire.xlsx",
    locationLabel: "Questionnaire!A5:D5 · Row 5",
    matchBadge: "98.2% cell-anchored",
    xlsxPreview: {
      sheetName: "Questionnaire",
      targetRow: 5,
      headers: ["Row", "Control Question", "Answer", "Citation"],
      rows: [
        {
          rowNum: 4,
          cells: ["MFA enforced for prod?", "Yes — all privileged accounts", "SOC2 p.14"],
        },
        {
          rowNum: 5,
          cells: ["Minimum password length?", "14 chars (2026 SOC 2)", "SOC2 p.12"],
          isTarget: true,
        },
        {
          rowNum: 6,
          cells: ["15-min sub-processor SLA?", "Flagged -> Human Triage", "Insufficient"],
        },
      ],
    },
  },
];

export interface PipelineStageSpec {
  step: string;
  name: "Scout" | "Quartermaster" | "Chronos" | "Vanguard" | "Ranger" | "Arbiter" | "Envoy";
  role: string;
  modelTier: string;
  inputLabel: string;
  outputLabel: string;
  checkpointRule: string;
  sampleTrace: string;
}

export const PIPELINE_STAGE_SPECS: PipelineStageSpec[] = [
  {
    step: "01",
    name: "Scout",
    role: "OCR Rescue",
    modelTier: "Vision SLM · Qwen2.5-VL-7B",
    inputLabel: "Raw PDF / image crops with ocr_confidence < 0.90",
    outputLabel: "Markdown AST nodes + bounding-box coordinates + Vision Rescue crops",
    checkpointRule: "Low-confidence regions (<0.90) are isolated for human approval rather than auto-verified.",
    sampleTrace: "Flagged Scanned_Addendum_p7.pdf bbox [96, 412, 488, 492] (ocr_confidence: 0.78).",
  },
  {
    step: "02",
    name: "Quartermaster",
    role: "Categorizer",
    modelTier: "Text SLM · Qwen2.5-14B",
    inputLabel: "Canonical AST nodes across PDF, XLSX, JSON, and Markdown",
    outputLabel: "Domain-tagged AST index (Access Control, IAM, Liability, Data Retention)",
    checkpointRule: "Preserves original source_locator (page, bbox, JSONPath, or cell range) on every node.",
    sampleTrace: "Classified 42 AST nodes into 6 compliance domains with zero node drops.",
  },
  {
    step: "03",
    name: "Chronos",
    role: "Temporal Tracker",
    modelTier: "Text SLM · Qwen2.5-14B",
    inputLabel: "Domain-tagged documents with effective dates & version headers",
    outputLabel: "Supersession graph linking stale policies via superseded_by edges",
    checkpointRule: "Ranks active 2026 policies ahead of legacy 2023 drafts while retaining lineage.",
    sampleTrace: "Marked Legacy_InfoSec_Policy_2023.pdf as superseded_by SOC2_Type_II_2026.pdf.",
  },
  {
    step: "04",
    name: "Vanguard",
    role: "Risk Prioritizer",
    modelTier: "Text SLM · Deterministic Rules",
    inputLabel: "Categorized + temporally ordered AST nodes",
    outputLabel: "Numeric risk score (0-100) + PriorityTier (P0_CRITICAL to P3_LOW)",
    checkpointRule: "Wildcard IAM actions (s3:*), uncapped liability, and missing proof score >=85 (P0).",
    sampleTrace: "Scored $.rules.wildcard-admin.action at 96/100 (P0_CRITICAL).",
  },
  {
    step: "05",
    name: "Ranger",
    role: "Fact Extractor",
    modelTier: "Text SLM · Instructor JSON",
    inputLabel: "Prioritized AST nodes & questionnaire prompts",
    outputLabel: "Strict ExtractedFact payloads with verbatim_quote + token logprobs",
    checkpointRule: "Zero freeform prose permitted; every fact must cite a persisted AST node ID.",
    sampleTrace: "Extracted verbatim MFA quote (99.4% match) + entity logprob 0.98.",
  },
  {
    step: "06",
    name: "Arbiter",
    role: "Conflict Resolver",
    modelTier: "Text SLM · Deterministic Cross-Check",
    inputLabel: "ExtractedFacts + Chronos supersession edges",
    outputLabel: "Explicit TEMPORAL_CONFLICT & cross-document contradiction work items",
    checkpointRule: "Contradictory clauses never silently merge; reviewers verify the governing rule.",
    sampleTrace: "Linked 2023 8-char password clause against 2026 14-char SOC 2 requirement.",
  },
  {
    step: "07",
    name: "Envoy",
    role: "Summary Scribe",
    modelTier: "Text SLM · Verification Gate",
    inputLabel: "Gate-checked ExtractedFacts (rapidfuzz >=97%, logprob >=0.92)",
    outputLabel: "Cited answers, .XLSX workbook export, or INSUFFICIENT_EVIDENCE block",
    checkpointRule: "Fails closed when quote score <97% or specificity fails—routing to /triage.",
    sampleTrace: "Synthesized 11 cited answers; blocked 1 unsupported 15-min SLA claim to /triage.",
  },
];

export interface VerificationPreset {
  id: string;
  label: string;
  quote: string;
  description: string;
}

export const VERIFICATION_FIXED_SOURCE =
  "Section 4.2 Logical Access: Access control requires multifactor authentication for all privileged accounts across production environments, audited quarterly by Security Operations.";

export const VERIFICATION_PRESETS: VerificationPreset[] = [
  {
    id: "exact-pass",
    label: "Verbatim Pass (>=97%)",
    quote:
      "Access control requires multifactor authentication for all privileged accounts across production environments.",
    description: "Exact verbatim sentence clears >=97% match and specificity checks.",
  },
  {
    id: "weak-short",
    label: "Weak: Too Short",
    quote: "multifactor auth",
    description: "Matches source words (100% partial) but fails <24 chars & <4 words rules.",
  },
  {
    id: "weak-header",
    label: "Weak: Bare Heading",
    quote: "Section 4.2 Logical Access",
    description: "Detected as a bare heading without a substantive policy verb or claim.",
  },
  {
    id: "fail-mismatch",
    label: "Fail: Paraphrase Drift",
    quote:
      "Hardware security keys are optional for staging engineers on weekends.",
    description: "Fails the 97% rapidfuzz gate and routes to human triage.",
  },
];

export interface RiskTierSpec {
  tier: "P0" | "P1" | "P2" | "P3";
  code: "P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM" | "P3_LOW";
  label: string;
  scoreRange: string;
  sla: string;
  routingLogic: string;
  tone: "danger" | "warning" | "brand" | "neutral";
  sampleFindings: Array<{
    title: string;
    source: string;
    locator: string;
    trigger: string;
  }>;
}

export const RISK_TIER_SPECS: RiskTierSpec[] = [
  {
    tier: "P0",
    code: "P0_CRITICAL",
    label: "Critical Blocker",
    scoreRange: "Score 85 – 100",
    sla: "Immediate (< 15 min triage)",
    routingLogic:
      "Blocks automated approval. Routes directly to top of /triage queue; legal escalation preserves original P0 score.",
    tone: "danger",
    sampleFindings: [
      {
        title: "Production IAM wildcard action s3:* on resource *",
        source: "aws_iam_prod_config.json",
        locator: "$.rules.wildcard-admin.action",
        trigger: "Vanguard IAM wildcard rule (96/100)",
      },
      {
        title: "Unsupported 15-minute fourth-party breach SLA claim",
        source: "Vendor_SLA_Addendum.pdf",
        locator: "No matching AST node (<97% gate)",
        trigger: "Citation gate hard block -> INSUFFICIENT_EVIDENCE",
      },
    ],
  },
  {
    tier: "P1",
    code: "P1_HIGH",
    label: "High / Verification Required",
    scoreRange: "Score 65 – 84",
    sla: "< 4 business hours",
    routingLogic:
      "Holds synthesis for human inspection: low-confidence Scout OCR crops (<0.90), weak-evidence quotes, or uncapped indemnity.",
    tone: "warning",
    sampleFindings: [
      {
        title: "Degraded scan crop on handwritten addendum signature",
        source: "Scanned_Addendum_p7.pdf",
        locator: "p. 7 · bbox [96, 412, 488, 492]",
        trigger: "Scout ocr_confidence 0.78 (< 0.90 threshold)",
      },
      {
        title: "Critical entity DATE logprob 0.88 below 0.92 gate",
        source: "MSA_Renewal_Draft.pdf",
        locator: "p. 4 · bbox [84, 310, 440, 338]",
        trigger: "Logprob threshold gate -> NEEDS_HUMAN_VERIFICATION",
      },
    ],
  },
  {
    tier: "P2",
    code: "P2_MEDIUM",
    label: "Medium / Temporal Review",
    scoreRange: "Score 35 – 64",
    sla: "< 24 business hours",
    routingLogic:
      "Includes Chronos temporal policy conflicts and gate-passed standard controls queued for audit sign-off.",
    tone: "brand",
    sampleFindings: [
      {
        title: "Password minimum 8 chars (2023) superseded by 14 chars (2026)",
        source: "Legacy_InfoSec_Policy_2023.pdf",
        locator: "p. 3 vs SOC2_Type_II_2026.pdf p. 12",
        trigger: "Chronos + Arbiter TEMPORAL_CONFLICT link",
      },
      {
        title: "Quarterly access review attestation verified",
        source: "SOC2_Type_II_2026.pdf",
        locator: "p. 14 · bbox [72, 610, 512, 636]",
        trigger: "99.4% rapidfuzz match · Standard control check",
      },
    ],
  },
  {
    tier: "P3",
    code: "P3_LOW",
    label: "Low / Informational",
    scoreRange: "Score 0 – 34",
    sla: "Batch / Weekly digest",
    routingLogic:
      "Verified metadata, boilerplate governance definitions, and N/A-eligible informational clauses logged in Audit Ledger.",
    tone: "neutral",
    sampleFindings: [
      {
        title: "Corporate headquarters jurisdiction & registered address",
        source: "SOC2_Type_II_2026.pdf",
        locator: "p. 2 · bbox [64, 180, 390, 204]",
        trigger: "99.8% verbatim match · Informational entity",
      },
      {
        title: "Non-applicable physical data-center badge policy (cloud-only)",
        source: "Enterprise_Security_Questionnaire.xlsx",
        locator: "Questionnaire!A19:D19",
        trigger: "Eligible for NOT_APPLICABLE attestation",
      },
    ],
  },
];

export type TriagePreviewStatus =
  | "NEEDS_REVIEW"
  | "VERIFIED"
  | "HUMAN_OVERRIDE"
  | "ESCALATED_LEGAL"
  | "NOT_APPLICABLE";

export interface TriagePreviewItem {
  id: string;
  priority: "P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM";
  title: string;
  sourceFile: string;
  locator: string;
  evidenceQuote: string;
  reason: string;
  hasVisionRescue?: boolean;
  initialStatus: TriagePreviewStatus;
}

export const INITIAL_TRIAGE_PREVIEW_ITEMS: TriagePreviewItem[] = [
  {
    id: "triage-iam-wildcard",
    priority: "P0_CRITICAL",
    title: "Production IAM policy allows wildcard s3:* on resource *",
    sourceFile: "aws_iam_prod_config.json",
    locator: "$.rules.wildcard-admin.action",
    evidenceQuote: '"effect": "Allow", "action": "s3:*", "resource": "*"',
    reason: "Vanguard scored 96/100 (P0_CRITICAL). Requires security confirmation or legal exception.",
    initialStatus: "NEEDS_REVIEW",
  },
  {
    id: "triage-vision-rescue",
    priority: "P1_HIGH",
    title: "Degraded addendum scan: Annual penetration test clause",
    sourceFile: "Scanned_Addendum_p7.pdf",
    locator: "p. 7 · bbox [96, 412, 488, 492]",
    evidenceQuote:
      "Vendor completes independent CREST-accredited penetration testing at least annually and shares executive summary.",
    reason: "Scout OCR confidence 0.78 (< 0.90). Vision Rescue crop ready for Accept / Override.",
    hasVisionRescue: true,
    initialStatus: "NEEDS_REVIEW",
  },
  {
    id: "triage-chronos-password",
    priority: "P2_MEDIUM",
    title: "Temporal conflict: 2023 8-char vs 2026 14-char password policy",
    sourceFile: "Legacy_InfoSec_Policy_2023.pdf",
    locator: "p. 3 -> SOC2_Type_II_2026.pdf p. 12",
    evidenceQuote:
      "Minimum password length is 14 characters per 2026 SOC 2 policy (supersedes 2023 8-character policy).",
    reason: "Chronos supersession edge detected by Arbiter. Confirm governing 2026 standard.",
    initialStatus: "NEEDS_REVIEW",
  },
];

export interface UseCaseTabSpec {
  id: "security-questionnaire" | "contract-risk-triage" | "degraded-scans";
  label: string;
  badge: string;
  headline: string;
  summary: string;
  locatorLabel: string;
}

export const USE_CASE_TABS: UseCaseTabSpec[] = [
  {
    id: "security-questionnaire",
    label: "Security Questionnaire",
    badge: ".XLSX",
    headline: "Auto-populate spreadsheets with cell-anchored proof—or flag gaps.",
    summary:
      "XLSXHandler streams workbooks row-by-row, enforces the >=97% quote gate against uploaded policies, and leaves unsupported rows explicitly flagged instead of guessing.",
    locatorLabel: "Questionnaire!A4:D6 -> SOC2_Type_II_2026.pdf",
  },
  {
    id: "contract-risk-triage",
    label: "Contract Risk Triage",
    badge: ".PDF + CHRONOS",
    headline: "Surface uncapped liability and stale policy overrides before signature.",
    summary:
      "Chronos ranks policy & MSA versions by effective date while Vanguard scores high-impact clauses (P0/P1) so legal teams review conflicts with exact page coordinates.",
    locatorLabel: "Legacy_InfoSec_Policy_2023.pdf p. 3 vs SOC2_Type_II_2026.pdf p. 12",
  },
  {
    id: "degraded-scans",
    label: "Degraded Scans",
    badge: "SCOUT OCR",
    headline: "Isolate low-confidence scans and handwritten stamps for Vision Rescue.",
    summary:
      "When ocr_confidence drops below 0.90, Scout blocks automated synthesis, attaches bounding-box coordinates, and queues the crop for human confirmation.",
    locatorLabel: "Scanned_Addendum_p7.pdf · p. 7 · bbox [96, 412, 488, 492]",
  },
];
