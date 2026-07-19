import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export type CaseErrorCode =
  | "INVALID_CASE_ID"
  | "CASE_NOT_FOUND"
  | "CASE_EXISTS"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "SCHEMA_INVALID"
  | "PATH_ESCAPE"
  | "MIGRATION_UNSUPPORTED"
  | "INVALID_SCOPE"
  | "ACTIVE_ATTEMPT"
  | "STALE_REVISION"
  | "READ_SET_STALE"
  | "REVIEW_INVALID"
  | "CANDIDATE_MISSING"
  | "PROMOTION_DENIED"
  | "DAG_INVALID"
  | "BLOCKER_INVALID"
  | "LOCK_BUSY";

export class CaseProtocolError extends Error {
  constructor(
    readonly code: CaseErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CaseProtocolError";
  }
}

const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const relativePath = z
  .string()
  .min(1)
  .refine((value) => {
    if (
      value.startsWith("/") ||
      value.includes("\\") ||
      value.includes("\0") ||
      value.includes(":")
    )
      return false;
    const segments = value.split("/");
    return segments.every((segment, index) => {
      if (segment === "." || segment === "..") return false;
      return segment.length > 0 || index === segments.length - 1;
    });
  }, "path must be a Case-root-relative POSIX path");

function versioned<T extends z.ZodType>(schema: T): z.ZodType<z.output<T>> {
  return z.preprocess((value) => {
    const version = (value as { schema_version?: unknown } | null)
      ?.schema_version;
    if (version !== SCHEMA_VERSION) {
      throw new CaseProtocolError(
        "SCHEMA_VERSION_UNSUPPORTED",
        `schema_version ${String(version)} is unsupported`,
      );
    }
    return value;
  }, schema);
}

export const ArtifactRefSchema = z.object({
  kind: z.string().min(1),
  path: relativePath,
  sha256,
  accepted_at: timestamp.optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

const rubricRef = z.object({ path: relativePath, sha256 });
export const CasePolicySchema = z.object({
  revision_budget: z.object({
    analysis: z.number().int().nonnegative(),
    modeling: z.number().int().nonnegative(),
    solving_per_task: z.number().int().nonnegative(),
    reporting: z.number().int().nonnegative(),
  }),
  rubrics: z.object({
    analysis: rubricRef,
    modeling: rubricRef,
    solving: rubricRef,
    reporting: rubricRef,
  }),
});
export type CasePolicy = z.infer<typeof CasePolicySchema>;

export const CaseFileSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    case_id: z.string().min(1),
    created_at: timestamp,
    input_manifest: z.literal("input/manifest.json"),
    source_kind: z.enum(["explicit-path", "problems-directory"]),
    policy: CasePolicySchema,
  }),
);
export type CaseFile = z.infer<typeof CaseFileSchema>;

export const InputManifestSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    files: z.array(
      z.object({
        source_label: z.string().min(1),
        path: relativePath,
        size: z.number().int().nonnegative(),
        sha256,
      }),
    ),
  }),
);
export type InputManifest = z.infer<typeof InputManifestSchema>;

export const BlockerSchema = z.object({
  id: z.string().min(1),
  scope: z.string().min(1),
  attempt_id: z.string().min(1),
  reason: z.string().min(1),
  created_at: timestamp,
  resolved_at: timestamp.nullable(),
});
export type Blocker = z.infer<typeof BlockerSchema>;

export const CaseStateSchema = versioned(
  z
    .object({
      schema_version: z.literal(SCHEMA_VERSION),
      case_id: z.string().min(1),
      revision: z.number().int().nonnegative(),
      stage: z.enum(["analysis", "modeling", "solving", "reporting"]),
      status: z.enum(["prepared", "running", "blocked", "failed", "completed"]),
      current_wave: z.number().int().positive().nullable(),
      accepted_artifacts: z.array(ArtifactRefSchema),
      revision_budget: z.object({
        analysis: z.number().int().nonnegative(),
        modeling: z.number().int().nonnegative(),
        solving: z.record(z.string(), z.number().int().nonnegative()),
        reporting: z.number().int().nonnegative(),
      }),
      blockers: z.array(BlockerSchema),
    })
    .superRefine((state, context) => {
      if ((state.stage === "solving") !== (state.current_wave !== null)) {
        context.addIssue({
          code: "custom",
          message: "current_wave is only valid during solving",
        });
      }
    }),
);
export type CaseState = z.infer<typeof CaseStateSchema>;

export const PromotionSchema = z.object({
  candidate: relativePath,
  target: relativePath,
  required: z.boolean(),
});
export type Promotion = z.infer<typeof PromotionSchema>;
export const ReviewSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    attempt_id: z.string().min(1),
    verdict: z.enum(["pass", "revise", "block"]),
    findings: z.array(z.string()),
    required_fixes: z.array(z.string()),
    evidence: z.array(relativePath).min(1),
    reviewed_at: timestamp,
  }),
);
export type Review = z.infer<typeof ReviewSchema>;

export const ContextManifestSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    case_id: z.string().min(1),
    attempt_id: z.string().min(1),
    scope: z.union([
      z.enum(["analysis", "modeling", "reporting"]),
      z.string().regex(/^solving\/[a-z0-9][a-z0-9-]{0,63}$/u),
    ]),
    sequence: z.number().int().positive(),
    created_at: timestamp,
    base_revision: z.number().int().nonnegative(),
    role: z.enum(["analyst", "modeler", "solver", "writer"]),
    current_task: z
      .object({
        id: z.string().min(1),
        description: z.string().min(1),
        requires_computation: z.boolean(),
      })
      .nullable(),
    goal: z.string().min(1),
    required_reads: z.array(ArtifactRefSchema),
    constraints: z.array(z.string()),
    allowed_writes: z.array(relativePath),
    expected_outputs: z.array(relativePath),
    promotions: z.array(PromotionSchema),
    acceptance: z.array(z.string()),
    review: z.object({
      rubric: rubricRef,
      required_reads: z.array(relativePath),
    }),
    latest_review: relativePath.nullable(),
    resolves_blocker: z.string().nullable(),
  }),
);
export type ContextManifest = z.infer<typeof ContextManifestSchema>;

export const TaskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  requires_computation: z.boolean(),
});
export type Task = z.infer<typeof TaskSchema>;
export const TaskListSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    tasks: z.array(TaskSchema),
  }),
);
export const TaskGraphSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    tasks: z.array(
      z.object({
        id: z.string().min(1),
        depends_on: z.array(z.string()),
        wave: z.number().int().positive(),
      }),
    ),
  }),
);
export type TaskGraph = z.infer<typeof TaskGraphSchema>;
export const TaskMemorySchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    task_id: z.string().min(1),
    task_description: z.string(),
    modeling_method: z.string(),
    result_interpretation: z.string(),
    execution_result: relativePath,
    code_outputs: z.array(relativePath),
    figures: z.array(relativePath),
  }),
);
export const RuntimeEvidenceSchema = versioned(
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    kind: z.string().min(1),
    path: relativePath,
    sha256,
    created_at: timestamp,
    status: z.enum(["succeeded", "failed"]),
    exit_code: z.number().int().optional(),
  }),
);

export type ActorRole = "analyst" | "modeler" | "solver" | "writer";
export type Scope = "analysis" | "modeling" | `solving/${string}` | "reporting";
export type OpenInput = {
  sourceKind: "explicit-path" | "problems-directory";
  files: Array<{
    label: string;
    sourcePath: string;
    expectedSize?: number;
    expectedSha256?: string;
  }>;
  policy: {
    revisionBudget: {
      analysis: number;
      modeling: number;
      solvingPerTask: number;
      reporting: number;
    };
    rubrics: Record<
      "analysis" | "modeling" | "solving" | "reporting",
      {
        sourcePath: string;
        expectedSize?: number;
        expectedSha256?: string;
      }
    >;
  };
};
export type DispatchInput = {
  caseId: string;
  role: ActorRole;
  taskId?: string;
  baseRevision?: number;
  goal: string;
  constraints?: string[];
  resolvesBlocker?: string;
};
export type GateInput = {
  caseId: string;
  attemptId: string;
  review: Review;
  expectedRevision: number;
};
export type CompletionEvidence = { complete: boolean; missing: string[] };
export type CaseSnapshot = {
  caseFile: CaseFile;
  inputManifest: InputManifest;
  state: CaseState;
  activeAttempts: ContextManifest[];
  completion: CompletionEvidence;
};
export type DispatchResult = {
  attemptId: string;
  contextPath: string;
  manifest: ContextManifest;
};
export type GateResult = {
  outcome: "pass" | "revise" | "block";
  promoted: ArtifactRef[];
  snapshot: CaseSnapshot;
};

export interface CaseContextStore {
  open(caseId: string, input?: OpenInput): Promise<CaseSnapshot>;
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  gate(input: GateInput): Promise<GateResult>;
  inspect(caseId: string): Promise<CaseSnapshot>;
}
