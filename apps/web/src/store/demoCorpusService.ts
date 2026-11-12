import type { ASTNode, Document, WorkItem } from "../types/bert";

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function buildDemoCorpus(): {
  workspaceId: string;
  documents: Document[];
  nodesByDocument: Record<string, ASTNode[]>;
  workItems: WorkItem[];
} {
  const wsId = uid();
  const batchId = uid();

  const doc1Id = uid();
  const doc2Id = uid();
  const doc3Id = uid();
  const doc4Id = uid();
  const doc5Id = uid();

  const doc1: Document = {
    id: doc1Id,
    filename: "SOC2_Type_II_2026.pdf",
    source_format: "PDF",
    category: "Security Controls & Attestation",
    sub_category: "SOC 2 Type II",
    priority_tier: "P2_MEDIUM",
    priority_score: 35,
    ast_checksum: "8f7a9d4e5c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6",
    file_size_bytes: 2516582,
    total_pages: 18,
    total_ast_nodes: 24,
    processing_status: "COMPLETED",
    effective_date: "2026-01-01",
    is_latest_version: true,
    workspace_id: wsId,
  };

  const doc2: Document = {
    id: doc2Id,
    filename: "Security_Questionnaire.xlsx",
    source_format: "XLSX",
    category: "Vendor Risk Assessment",
    sub_category: "Enterprise Security Review",
    priority_tier: "P1_HIGH",
    priority_score: 75,
    ast_checksum: "4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3",
    file_size_bytes: 18840,
    total_pages: 0,
    total_ast_nodes: 16,
    processing_status: "COMPLETED",
    effective_date: "2026-02-01",
    is_latest_version: true,
    workspace_id: wsId,
  };

  const doc3: Document = {
    id: doc3Id,
    filename: "aws_iam_prod_config.json",
    source_format: "JSON",
    category: "Cloud Infrastructure",
    sub_category: "IAM Policies",
    priority_tier: "P0_CRITICAL",
    priority_score: 98,
    ast_checksum: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
    file_size_bytes: 4320,
    total_pages: 0,
    total_ast_nodes: 8,
    processing_status: "COMPLETED",
    effective_date: "2026-02-10",
    is_latest_version: true,
    workspace_id: wsId,
  };

  const doc4: Document = {
    id: doc4Id,
    filename: "Scanned_Addendum_p7.pdf",
    source_format: "PDF",
    category: "Legal & Liability Addendum",
    sub_category: "Degraded Scan OCR",
    priority_tier: "P0_CRITICAL",
    priority_score: 96,
    ast_checksum: "5c4b3a2f1e0d9c8b7a6f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7",
    file_size_bytes: 1153433,
    total_pages: 1,
    total_ast_nodes: 4,
    processing_status: "COMPLETED",
    effective_date: "2026-02-14",
    is_latest_version: true,
    workspace_id: wsId,
  };

  const doc5: Document = {
    id: doc5Id,
    filename: "Legacy_InfoSec_Policy_2023.pdf",
    source_format: "PDF",
    category: "Legacy Security Governance",
    sub_category: "Superseded Policy",
    priority_tier: "P2_MEDIUM",
    priority_score: 42,
    ast_checksum: "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
    file_size_bytes: 412000,
    total_pages: 3,
    total_ast_nodes: 4,
    processing_status: "COMPLETED",
    effective_date: "2023-01-01",
    is_latest_version: false,
    workspace_id: wsId,
  };

  const n1Id = uid();
  const n2Id = uid();
  const n3Id = uid();
  const n4Id = uid();
  const n5NodeId = uid();
  const q1Id = uid();
  const q2Id = uid();
  const q8Id = uid();
  const q11Id = uid();
  const qWeakId = uid();
  const n7Id = uid();
  const j2Id = uid();
  const n8Id = uid();
  const nLegacyPwdId = uid();

  // Bottom-up PDF point space coordinates calibrated for 612x792pt pages
  const nodesByDocument: Record<string, ASTNode[]> = {
    [doc1Id]: [
      {
        id: n1Id,
        document_id: doc1Id,
        node_type: "SECTION",
        section_path: "§ 2.1 Identity & Access",
        verbatim_text:
          "Access control requires multifactor authentication for privileged accounts across all production environments.",
        structured_payload: null,
        page_number: 4,
        bounding_box: { x0: 72, y0: 597, x1: 520, y1: 652 },
        ocr_confidence: 0.99,
        node_order: 1,
        locator: {
          source_type: "pdf",
          doc_id: doc1Id,
          page: 4,
          bbox: [72, 597, 520, 652],
          coord_system: "pdf_user_space_bl_pt",
          page_width: 612,
          page_height: 792,
          crop_box: [0, 0, 612, 792],
          rotation: 0,
          node_id: n1Id,
          checksum: doc1.ast_checksum,
        },
      },
      {
        id: n2Id,
        document_id: doc1Id,
        node_type: "SECTION",
        section_path: "§ 3.4 Cryptographic Standards",
        verbatim_text:
          "Encryption at rest uses AES-256 and keys are rotated annually via automated KMS schedules.",
        structured_payload: null,
        page_number: 7,
        bounding_box: { x0: 72, y0: 427, x1: 510, y1: 482 },
        ocr_confidence: 0.99,
        node_order: 2,
        locator: {
          source_type: "pdf",
          doc_id: doc1Id,
          page: 7,
          bbox: [72, 427, 510, 482],
          coord_system: "pdf_user_space_bl_pt",
          page_width: 612,
          page_height: 792,
          crop_box: [0, 0, 612, 792],
          rotation: 0,
          node_id: n2Id,
          checksum: doc1.ast_checksum,
        },
      },
      {
        id: n3Id,
        document_id: doc1Id,
        node_type: "SECTION",
        section_path: "§ 4.2 Audit Trails",
        verbatim_text:
          "Audit logs are retained for 7 years in immutable WORM storage with daily cryptographic integrity validation.",
        structured_payload: null,
        page_number: 12,
        bounding_box: { x0: 72, y0: 517, x1: 530, y1: 572 },
        ocr_confidence: 0.98,
        node_order: 3,
        locator: {
          source_type: "pdf",
          doc_id: doc1Id,
          page: 12,
          bbox: [72, 517, 530, 572],
          coord_system: "pdf_user_space_bl_pt",
          page_width: 612,
          page_height: 792,
          crop_box: [0, 0, 612, 792],
          rotation: 0,
          node_id: n3Id,
          checksum: doc1.ast_checksum,
        },
      },
      {
        id: n4Id,
        document_id: doc1Id,
        node_type: "SECTION",
        section_path: "§ 5.1 Business Continuity",
        verbatim_text:
          "Target RTO is 4 hours and RPO is 1 hour across primary availability zones.",
        structured_payload: null,
        page_number: 15,
        bounding_box: { x0: 72, y0: 322, x1: 490, y1: 372 },
        ocr_confidence: 0.98,
        node_order: 4,
        locator: {
          source_type: "pdf",
          doc_id: doc1Id,
          page: 15,
          bbox: [72, 322, 490, 372],
          coord_system: "pdf_user_space_bl_pt",
          page_width: 612,
          page_height: 792,
          crop_box: [0, 0, 612, 792],
          rotation: 0,
          node_id: n4Id,
          checksum: doc1.ast_checksum,
        },
      },
      {
        id: n5NodeId,
        document_id: doc1Id,
        node_type: "SECTION",
        section_path: "§ 6.3 Incident Response SLA",
        verbatim_text:
          "Confirmed security incidents require customer notification within 24 hours of verification.",
        structured_payload: null,
        page_number: 17,
        bounding_box: { x0: 72, y0: 582, x1: 515, y1: 632 },
        ocr_confidence: 0.99,
        node_order: 5,
        locator: {
          source_type: "pdf",
          doc_id: doc1Id,
          page: 17,
          bbox: [72, 582, 515, 632],
          coord_system: "pdf_user_space_bl_pt",
          page_width: 612,
          page_height: 792,
          crop_box: [0, 0, 612, 792],
          rotation: 0,
          node_id: n5NodeId,
          checksum: doc1.ast_checksum,
        },
      },
    ],
    [doc2Id]: [
      {
        id: q1Id,
        document_id: doc2Id,
        node_type: "TABLE_ROW",
        section_path: "Questionnaire Row 1",
        verbatim_text:
          "Does the company enforce MFA for privileged accounts? -> Yes, enforced via SAML 2.0 and hardware security keys.",
        structured_payload: {
          sheet_name: "Questionnaire",
          row_index: 1,
          row: 1,
          col_A: "MFA Enforced",
          col_B: "Yes",
        },
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 1,
        locator: {
          source_type: "xlsx",
          doc_id: doc2Id,
          sheet: "Questionnaire",
          row: 1,
          col_range: "A1:B1",
          node_id: q1Id,
          checksum: doc2.ast_checksum,
        },
      },
      {
        id: q2Id,
        document_id: doc2Id,
        node_type: "TABLE_ROW",
        section_path: "Questionnaire Row 2",
        verbatim_text:
          "Which encryption standard is used at rest? -> AES-256 for all databases and object buckets.",
        structured_payload: {
          sheet_name: "Questionnaire",
          row_index: 2,
          row: 2,
          col_A: "Encryption at Rest",
          col_B: "AES-256",
        },
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 2,
        locator: {
          source_type: "xlsx",
          doc_id: doc2Id,
          sheet: "Questionnaire",
          row: 2,
          col_range: "A2:B2",
          node_id: q2Id,
          checksum: doc2.ast_checksum,
        },
      },
      {
        id: q8Id,
        document_id: doc2Id,
        node_type: "TABLE_ROW",
        section_path: "Questionnaire Row 8",
        verbatim_text:
          "EU customer data is localized to Frankfurt eu-central-1 with Standard Contractual Clauses.",
        structured_payload: {
          sheet_name: "Questionnaire",
          row_index: 8,
          row: 8,
          col_A: "EU Data Residency",
          col_B: "Frankfurt",
        },
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 3,
        locator: {
          source_type: "xlsx",
          doc_id: doc2Id,
          sheet: "Questionnaire",
          row: 8,
          col_range: "A8:B8",
          node_id: q8Id,
          checksum: doc2.ast_checksum,
        },
      },
      {
        id: q11Id,
        document_id: doc2Id,
        node_type: "TABLE_ROW",
        section_path: "Questionnaire Row 11",
        verbatim_text:
          "Provide the vendor's cyber insurance limit. -> [Unanswered - Evidence Missing in Corpus]",
        structured_payload: {
          sheet_name: "Questionnaire",
          row_index: 11,
          row: 11,
          col_A: "Cyber Insurance Limit",
          col_B: "",
        },
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 4,
        locator: {
          source_type: "xlsx",
          doc_id: doc2Id,
          sheet: "Questionnaire",
          row: 11,
          col_range: "A11:B11",
          node_id: q11Id,
          checksum: doc2.ast_checksum,
        },
      },
      {
        id: qWeakId,
        document_id: doc2Id,
        node_type: "TABLE_ROW",
        section_path: "Questionnaire Row 12",
        verbatim_text: "Section 4 Penetration Testing",
        structured_payload: {
          sheet_name: "Questionnaire",
          row_index: 12,
          row: 12,
          col_A: "Penetration Testing Cadence",
          col_B: "Section 4 Penetration Testing",
        },
        page_number: 1,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 5,
        locator: {
          source_type: "xlsx",
          doc_id: doc2Id,
          sheet: "Questionnaire",
          row: 12,
          col_range: "A12:B12",
          node_id: qWeakId,
          checksum: doc2.ast_checksum,
        },
      },
    ],
    [doc3Id]: [
      {
        id: n7Id,
        document_id: doc3Id,
        node_type: "JSON_RULE",
        section_path: "$.rules.wildcard-admin",
        verbatim_text: '{"effect": "Allow", "action": "s3:*", "resource": "*"}',
        structured_payload: { effect: "Allow", action: "s3:*", resource: "*" },
        page_number: null,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 1,
        locator: {
          source_type: "json",
          doc_id: doc3Id,
          json_path: "$.rules.wildcard-admin",
          node_id: n7Id,
          checksum: doc3.ast_checksum,
        },
      },
      {
        id: j2Id,
        document_id: doc3Id,
        node_type: "JSON_RULE",
        section_path: "$.rules.production-read",
        verbatim_text:
          '{"effect": "Allow", "action": "s3:GetObject", "resource": "arn:aws:s3:::prod/*"}',
        structured_payload: {
          effect: "Allow",
          action: "s3:GetObject",
          resource: "arn:aws:s3:::prod/*",
        },
        page_number: null,
        bounding_box: null,
        ocr_confidence: 1.0,
        node_order: 2,
        locator: {
          source_type: "json",
          doc_id: doc3Id,
          json_path: "$.rules.production-read",
          node_id: j2Id,
          checksum: doc3.ast_checksum,
        },
      },
    ],
    [doc4Id]: [
      {
        id: n8Id,
        document_id: doc4Id,
        node_type: "SCAN_STAMP",
        section_path: "Scanned Page 1 Bottom Margin",
        verbatim_text:
          "[LOW_CONFIDENCE] STAMP NOTE: Compliance addendum reviewed 2026-02-14 — uncapped indemnification override for third-party security incidents.",
        structured_payload: null,
        page_number: 1,
        bounding_box: { x0: 60, y0: 32, x1: 540, y1: 112 },
        ocr_confidence: 0.81,
        node_order: 1,
          locator: {
            source_type: "pdf",
            doc_id: doc4Id,
            page: 1,
            bbox: [60, 32, 540, 112],
            coord_system: "pdf_user_space_bl_pt",
            page_width: 612,
            page_height: 792,
            crop_box: [0, 0, 612, 792],
            rotation: 0,
            node_id: n8Id,
            checksum: doc4.ast_checksum,
            is_scan: true,
          },
        },
      ],
      [doc5Id]: [
        {
          id: nLegacyPwdId,
          document_id: doc5Id,
          node_type: "SECTION",
          section_path: "§ 3.2 Legacy Password Rotation (2023)",
          verbatim_text:
            "Service and privileged accounts must rotate static passwords every 90 days.",
          structured_payload: null,
          page_number: 1,
          bounding_box: null,
          ocr_confidence: 0.99,
          node_order: 1,
          locator: {
            source_type: "pdf",
            doc_id: doc5Id,
            page: 1,
            bbox: [72, 660, 520, 700],
            coord_system: "pdf_user_space_bl_pt",
            page_width: 612,
            page_height: 792,
            crop_box: [0, 0, 612, 792],
            rotation: 0,
            node_id: nLegacyPwdId,
            checksum: doc5.ast_checksum,
          },
        },
      ],
    };

  const workItems: WorkItem[] = [
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc1Id,
      item_type: "SECURITY_QUESTION",
      category: "Access Control",
      priority_tier: "P2_MEDIUM",
      priority_score: 28,
      prompt_or_question: "Does the company enforce MFA for privileged accounts?",
      fluent_output:
        "Access control requires multifactor authentication for all privileged accounts across production environments.",
      structured_facts: [
        {
          fact_type: "CONTROL",
          value: "MFA Required",
          verbatim_quote:
            "Access control requires multifactor authentication for privileged accounts.",
          ast_node_id: n1Id,
          confidence: 0.99,
        },
      ],
      verified_citations: [
        {
          quote:
            "Access control requires multifactor authentication for privileged accounts.",
          ast_node_id: n1Id,
          page_number: 4,
          document_filename: doc1.filename,
          bounding_box: { x0: 72, y0: 597, x1: 520, y1: 652 },
          locator: nodesByDocument[doc1Id][0].locator,
          confidence_score: 100,
          region_match_score: 100,
        },
      ],
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER2_SLM_REGIMENT",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text:
        "Access control requires multifactor authentication for privileged accounts across all production environments.",
      gate_telemetry: {
        citation_match: 100,
        critical_logprob: 0.99,
        failed_citations: [],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc1Id,
      item_type: "SECURITY_QUESTION",
      category: "Cryptography & Keys",
      priority_tier: "P2_MEDIUM",
      priority_score: 32,
      prompt_or_question: "Which encryption standard is used at rest?",
      fluent_output:
        "All production datastores are encrypted at rest using AES-256 with keys rotated annually via automated KMS schedules.",
      structured_facts: [
        {
          fact_type: "ENCRYPTION",
          value: "AES-256",
          verbatim_quote:
            "Encryption at rest uses AES-256 and keys are rotated annually.",
          ast_node_id: n2Id,
          confidence: 0.99,
        },
      ],
      verified_citations: [
        {
          quote: "Encryption at rest uses AES-256 and keys are rotated annually.",
          ast_node_id: n2Id,
          page_number: 7,
          document_filename: doc1.filename,
          bounding_box: { x0: 72, y0: 427, x1: 510, y1: 482 },
          locator: nodesByDocument[doc1Id][1].locator,
          confidence_score: 100,
          region_match_score: 100,
        },
      ],
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER2_SLM_REGIMENT",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text:
        "Encryption at rest uses AES-256 and keys are rotated annually via automated KMS schedules.",
      gate_telemetry: {
        citation_match: 100,
        critical_logprob: 0.99,
        failed_citations: [],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 3400000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc3Id,
      item_type: "CONFIG_AUDIT",
      category: "Cloud Infrastructure",
      priority_tier: "P0_CRITICAL",
      priority_score: 98,
      prompt_or_question: "Does AWS production contain a wildcard S3 action?",
      fluent_output:
        "Critical security violation: IAM policy 'wildcard-admin' grants unrestricted 's3:*' access on resource '*'.",
      structured_facts: [
        {
          fact_type: "IAM_RULE",
          value: "s3:* on *",
          verbatim_quote: '{"effect": "Allow", "action": "s3:*", "resource": "*"}',
          ast_node_id: n7Id,
          confidence: 0.97,
        },
      ],
      verified_citations: [
        {
          quote: '{"effect": "Allow", "action": "s3:*", "resource": "*"}',
          ast_node_id: n7Id,
          page_number: null,
          document_filename: doc3.filename,
          bounding_box: null,
          locator: nodesByDocument[doc3Id][0].locator,
          confidence_score: 99.4,
          region_match_score: 99.4,
        },
      ],
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER3_ARBITER",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text: '{"effect": "Allow", "action": "s3:*", "resource": "*"}',
      gate_telemetry: {
        citation_match: 99.4,
        critical_logprob: 0.97,
        failed_citations: [],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 3200000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc4Id,
      item_type: "HUMAN_ESCALATION",
      category: "Liability & Indemnification",
      priority_tier: "P0_CRITICAL",
      priority_score: 96,
      prompt_or_question:
        "Review unverified physical stamp note regarding liability cap",
      fluent_output:
        "Insufficient evidence in uploaded corpus — degraded scan OCR confidence is 81.2%. Flagged for manual review.",
      structured_facts: [
        {
          fact_type: "STAMP_NOTE",
          value: "Uncapped indemnification override",
          verbatim_quote:
            "[LOW_CONFIDENCE] STAMP NOTE: Compliance addendum reviewed 2026-02-14 — uncapped indemnification override",
          ast_node_id: n8Id,
          confidence: 0.81,
        },
      ],
      verified_citations: [
        {
          quote:
            "[LOW_CONFIDENCE] STAMP NOTE: Compliance addendum reviewed 2026-02-14",
          ast_node_id: n8Id,
          page_number: 1,
          document_filename: doc4.filename,
          bounding_box: { x0: 60, y0: 32, x1: 540, y1: 112 },
          locator: nodesByDocument[doc4Id][0].locator,
          confidence_score: 81.2,
          region_match_score: 81.2,
        },
      ],
      verification_status: "NEEDS_HUMAN_VERIFICATION",
      resolved_by_tier: "SCOUT_VISION_RESCUE",
      has_vision_rescue: true,
      vision_rescue_text:
        "STAMP NOTE: Compliance addendum reviewed 2026-02-14 — uncapped indemnification override for third-party security incidents.",
      machine_extracted_text: null,
      gate_telemetry: {
        citation_match: 81.2,
        critical_logprob: 0.81,
        failed_citations: [],
        failed_logprobs: ["low_ocr_confidence_0.81"],
      },
      created_at: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc2Id,
      item_type: "QUESTIONNAIRE_ROW",
      category: "Vendor Risk Assessment",
      priority_tier: "P0_CRITICAL",
      priority_score: 100,
      prompt_or_question: "Provide the vendor's cyber insurance limit.",
      fluent_output:
        "Insufficient evidence in uploaded corpus — flagged for manual review.",
      structured_facts: [],
      verified_citations: [],
      verification_status: "INSUFFICIENT_EVIDENCE",
      resolved_by_tier: "GATE_FAIL_REJECTED",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text: null,
      gate_telemetry: {
        citation_match: 0,
        critical_logprob: 0,
        failed_citations: ["No matching text in uploaded corpus"],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 2800000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc1Id,
      item_type: "TEMPORAL_CONFLICT",
      category: "Temporal Conflicts",
      priority_tier: "P1_HIGH",
      original_priority_tier: "P1_HIGH",
      priority_score: 80,
      prompt_or_question: "What is the password rotation conflict between policies?",
      fluent_output:
        "Chronos temporal conflict detected: SOC2_Type_II_2026.pdf (2026-01-01) supersedes Legacy_InfoSec_Policy_2023.pdf (2023-01-01). 90-day static password rotation is deprecated in favor of continuous SAML 2.0 SSO + hardware MFA.",
      structured_facts: [
        {
          fact_type: "POLICY_SUPERSEDED",
          value: "90-day rotation deprecated (2026 supersedes 2023)",
          verbatim_quote:
            "Access control requires multifactor authentication for privileged accounts across all production environments.",
          ast_node_id: n1Id,
          confidence: 0.98,
        },
        {
          fact_type: "LEGACY_CONFLICTING_CLAUSE",
          value: "Legacy 90-day rotation (superseded)",
          verbatim_quote:
            "Service and privileged accounts must rotate static passwords every 90 days.",
          ast_node_id: nLegacyPwdId,
          confidence: 0.99,
        },
      ],
      verified_citations: [
        {
          quote:
            "Access control requires multifactor authentication for privileged accounts across all production environments.",
          ast_node_id: n1Id,
          page_number: 4,
          document_filename: doc1.filename,
          bounding_box: { x0: 72, y0: 597, x1: 520, y1: 652 },
          locator: nodesByDocument[doc1Id][0].locator,
          confidence_score: 98.2,
          region_match_score: 98.2,
        },
        {
          quote:
            "Service and privileged accounts must rotate static passwords every 90 days.",
          ast_node_id: nLegacyPwdId,
          page_number: 1,
          document_filename: doc5.filename,
          bounding_box: { x0: 72, y0: 660, x1: 520, y1: 700 },
          locator: nodesByDocument[doc5Id][0].locator,
          confidence_score: 99.0,
          region_match_score: 99.0,
        },
      ],
      temporal_conflict: {
        newer_doc_id: doc1Id,
        newer_filename: doc1.filename,
        newer_effective_date: "2026-01-01",
        newer_quote:
          "Access control requires multifactor authentication for privileged accounts across all production environments.",
        older_doc_id: doc5Id,
        older_filename: doc5.filename,
        older_effective_date: "2023-01-01",
        older_quote:
          "Service and privileged accounts must rotate static passwords every 90 days.",
        resolution: "SUPERSEDED_BY_NEWER_POLICY",
      },
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER3_ARBITER",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text:
        "Access control requires multifactor authentication for privileged accounts across all production environments.",
      gate_telemetry: {
        citation_match: 98.2,
        critical_logprob: 0.98,
        failed_citations: [],
        failed_logprobs: [],
        supersession: "2026_OVER_2023",
      },
      evidence_quality: "strong",
      created_at: new Date(Date.now() - 2600000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc1Id,
      item_type: "COMPLIANCE_FINDING",
      category: "Data Retention",
      priority_tier: "P2_MEDIUM",
      priority_score: 35,
      prompt_or_question: "Which data retention control is documented?",
      fluent_output:
        "Audit logs are retained for 7 years in immutable WORM storage with daily cryptographic integrity validation.",
      structured_facts: [
        {
          fact_type: "RETENTION_TERM",
          value: "7 Years WORM",
          verbatim_quote:
            "Audit logs are retained for 7 years in immutable WORM storage.",
          ast_node_id: n3Id,
          confidence: 0.98,
        },
      ],
      verified_citations: [
        {
          quote:
            "Audit logs are retained for 7 years in immutable WORM storage.",
          ast_node_id: n3Id,
          page_number: 12,
          document_filename: doc1.filename,
          bounding_box: { x0: 72, y0: 517, x1: 530, y1: 572 },
          locator: nodesByDocument[doc1Id][2].locator,
          confidence_score: 98.5,
          region_match_score: 98.5,
        },
      ],
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER2_SLM_REGIMENT",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text:
        "Audit logs are retained for 7 years in immutable WORM storage with daily cryptographic integrity validation.",
      gate_telemetry: {
        citation_match: 98.5,
        critical_logprob: 0.98,
        failed_citations: [],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 2400000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc1Id,
      item_type: "COMPLIANCE_FINDING",
      category: "Disaster Recovery",
      priority_tier: "P2_MEDIUM",
      priority_score: 40,
      prompt_or_question: "What are the documented RTO and RPO targets?",
      fluent_output:
        "The platform maintains a Recovery Time Objective (RTO) of 4 hours and Recovery Point Objective (RPO) of 1 hour across primary availability zones.",
      structured_facts: [
        {
          fact_type: "DR_METRIC",
          value: "RTO 4h / RPO 1h",
          verbatim_quote:
            "Target RTO is 4 hours and RPO is 1 hour across primary availability zones.",
          ast_node_id: n4Id,
          confidence: 0.98,
        },
      ],
      verified_citations: [
        {
          quote:
            "Target RTO is 4 hours and RPO is 1 hour across primary availability zones.",
          ast_node_id: n4Id,
          page_number: 15,
          document_filename: doc1.filename,
          bounding_box: { x0: 72, y0: 322, x1: 490, y1: 372 },
          locator: nodesByDocument[doc1Id][3].locator,
          confidence_score: 98.9,
          region_match_score: 98.9,
        },
      ],
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER2_SLM_REGIMENT",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text:
        "Target RTO is 4 hours and RPO is 1 hour across primary availability zones.",
      gate_telemetry: {
        citation_match: 98.9,
        critical_logprob: 0.98,
        failed_citations: [],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 2200000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc2Id,
      item_type: "QUESTIONNAIRE_ROW",
      category: "Data Privacy & GDPR",
      priority_tier: "P1_HIGH",
      priority_score: 68,
      prompt_or_question:
        "Are EU customer records stored exclusively in EU regions?",
      fluent_output:
        "All EU customer data is processed and stored in Frankfurt (eu-central-1) with Standard Contractual Clauses (SCCs) in place.",
      structured_facts: [
        {
          fact_type: "DATA_LOCALIZATION",
          value: "Frankfurt eu-central-1",
          verbatim_quote:
            "EU customer data is localized to Frankfurt eu-central-1.",
          ast_node_id: q8Id,
          confidence: 0.99,
        },
      ],
      verified_citations: [
        {
          quote: "EU customer data is localized to Frankfurt eu-central-1.",
          ast_node_id: q8Id,
          page_number: 1,
          document_filename: doc2.filename,
          bounding_box: null,
          locator: nodesByDocument[doc2Id][2].locator,
          confidence_score: 99.1,
          region_match_score: 99.1,
        },
      ],
      verification_status: "VERIFIED",
      resolved_by_tier: "TIER2_SLM_REGIMENT",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text:
        "EU customer data is localized to Frankfurt eu-central-1 with Standard Contractual Clauses.",
      gate_telemetry: {
        citation_match: 99.1,
        critical_logprob: 0.99,
        failed_citations: [],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 2000000).toISOString(),
    },
    {
      id: uid(),
      workspace_id: wsId,
      batch_id: batchId,
      document_id: doc2Id,
      item_type: "COMPLIANCE_FINDING",
      category: "Security Testing",
      priority_tier: "P1_HIGH",
      original_priority_tier: "P1_HIGH",
      priority_score: 65,
      prompt_or_question: "What is the annual third-party penetration testing cadence?",
      fluent_output:
        "Weak evidence flagged: matched quote is a bare section heading ('Section 4 Penetration Testing') without substantive control details.",
      structured_facts: [
        {
          fact_type: "CONTROL_HEADING",
          value: "Section 4 Penetration Testing",
          verbatim_quote: "Section 4 Penetration Testing",
          ast_node_id: qWeakId,
          confidence: 0.92,
        },
      ],
      verified_citations: [
        {
          quote: "Section 4 Penetration Testing",
          ast_node_id: qWeakId,
          page_number: 1,
          document_filename: doc2.filename,
          bounding_box: null,
          locator: nodesByDocument[doc2Id][4].locator,
          confidence_score: 100,
          region_match_score: 100,
        },
      ],
      verification_status: "NEEDS_HUMAN_VERIFICATION",
      resolved_by_tier: "TIER2_SLM_REGIMENT",
      has_vision_rescue: false,
      vision_rescue_text: null,
      machine_extracted_text: "Section 4 Penetration Testing",
      weak_evidence: true,
      weak_evidence_reason:
        "Bare heading / insufficient quote specificity (4 words, 29 chars) — flagged for reviewer substantiation.",
      evidence_quality: "weak",
      gate_telemetry: {
        citation_match: 100,
        critical_logprob: 0.92,
        failed_citations: ["weak_quote_heading_only"],
        failed_logprobs: [],
      },
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  return {
    workspaceId: wsId,
    documents: [doc1, doc2, doc3, doc4, doc5],
    nodesByDocument,
    workItems,
  };
}
