import type { ScriptStatus, VideoPhase } from "../types";

export interface DashboardVideo {
  id: string;
  title: string;
  status: "draft" | "processing" | "ready" | "failed";
  phase: VideoPhase;
  scriptStatus: ScriptStatus | null;
  thumbnailUrl: string | null;
  duration: number | null;
  createdAt: string;
  targetDate: string | null;
  commentCount: number;
  approvalCount: number;
  requiredApprovals: number;
}
