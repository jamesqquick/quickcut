import { z } from "zod";

const pointAnnotationSchema = z.object({
  type: z.literal("point"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const rectAnnotationSchema = z.object({
  type: z.literal("rect"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const textRangeSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  quote: z.string().max(1000),
});

export const annotationSchema = z.discriminatedUnion("type", [
  pointAnnotationSchema,
  rectAnnotationSchema,
]);

export const uploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileSize: z.number().positive().max(5 * 1024 * 1024 * 1024, "File exceeds 5GB limit"),
  spaceId: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().max(2000).optional(),
  folderId: z.string().uuid().nullable().optional(),
  generateTranscript: z.boolean().optional(),
});

export const urgencySchema = z.enum([
  "idea",
  "suggestion",
  "important",
  "critical",
]);

export const commentSchema = z.object({
  text: z.string().min(1, "Comment text is required").max(5000),
  timestamp: z.number().nullable().optional(),
  annotation: annotationSchema.nullable().optional(),
  urgency: urgencySchema.optional().default("suggestion"),
  phase: z.enum(["script", "review"]).optional().default("review"),
  textRange: textRangeSchema.nullable().optional(),
});

export const anonymousCommentSchema = z.object({
  text: z.string().min(1, "Comment text is required").max(5000),
  timestamp: z.number().nullable().optional(),
  name: z.string().min(1, "Name is required").max(100),
  parentId: z.string().optional(),
  annotation: annotationSchema.nullable().optional(),
  urgency: urgencySchema.optional().default("suggestion"),
});

export const videoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  folderId: z.string().uuid().nullable().optional(),
  targetDate: z.string().date().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Project statuses. The persisted column is still named `phase` for now.
// ---------------------------------------------------------------------------

export const VIDEO_PHASES = [
  "creating_script",
  "reviewing_script",
  "reviewing_video",
  "video_approved",
  "published",
] as const;
export type VideoPhase = (typeof VIDEO_PHASES)[number];

export const phaseSchema = z.enum(VIDEO_PHASES);

export const phaseUpdateSchema = z.object({
  phase: phaseSchema,
});

export const SCRIPT_STATUSES = ["writing", "review"] as const;
export const scriptStatusSchema = z.enum(SCRIPT_STATUSES);

export const scriptStatusUpdateSchema = z.object({
  status: scriptStatusSchema,
});

export const projectCreateSchema = z.object({
  title: z.string().trim().min(1, "Project title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  spaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  targetDate: z.string().date().nullable().optional(),
});

export const scriptUpdateSchema = z.object({
  content: z.string().max(200_000),
  plainText: z.string().max(200_000).optional(),
});

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(120),
  spaceId: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const folderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

export const spaceCreateSchema = z.object({
  name: z.string().trim().min(1, "Space name is required").max(120),
  requiredApprovals: z.number().int().min(0).max(100).optional().default(0),
});

export const spaceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  requiredApprovals: z.number().int().min(0).max(100).optional(),
  pipelineEnabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const inviteCreateSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.trim().toLowerCase()),
});

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const approveVideoSchema = z.object({
  comment: z.string().max(500).optional(),
});
