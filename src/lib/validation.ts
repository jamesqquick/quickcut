import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

export const uploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileSize: z.number().positive().max(5 * 1024 * 1024 * 1024, "File exceeds 5GB limit"),
  title: z.string().optional(),
});

export const commentSchema = z.object({
  text: z.string().min(1, "Comment text is required").max(5000),
  timestamp: z.number().nullable().optional(),
});

export const anonymousCommentSchema = z.object({
  text: z.string().min(1, "Comment text is required").max(5000),
  timestamp: z.number().nullable().optional(),
  displayName: z.string().min(1, "Display name is required").max(100),
  parentId: z.string().optional(),
});

export const videoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export const reviewStatusSchema = z.object({
  reviewStatus: z.enum(["no_status", "needs_review", "in_progress", "approved"]),
});

export type ReviewStatus = z.infer<typeof reviewStatusSchema>["reviewStatus"];
