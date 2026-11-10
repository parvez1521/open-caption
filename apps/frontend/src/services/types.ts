export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at?: string;
}

export type ProjectStatus = "CREATED" | "UPLOADED" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  style?: string;
  thumbnail_url?: string;
  /** ISO-639-1 transcription language hint (e.g. "en", "hi"); undefined/"" = auto-detect. */
  language?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  archived_at?: string;
  aspect_ratio?: string;
  /** A15 organisation: single folder label (null = unfiled) + tags. Absent until the folders/tags database update is applied. */
  folder?: string | null;
  tags?: string[];
  video?: Video;
  transcript?: Transcript;
}

export interface Video {
  id: string;
  project_id: string;
  storage_path: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  file_size: number;
  uploaded_at: string;
}

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  project_id: string;
  job_type: "processing" | "export";
  status: JobStatus;
  progress: number;
  stage?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
}

export interface TranscriptWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface Transcript {
  id: string;
  project_id: string;
  language: string;
  provider: string;
  version: string;
  words: TranscriptWord[];
  transcript_json?: { words: any[] };
}

export interface CaptionSegment {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  emphasis: boolean;
  confidence: number;
}

export interface CaptionPlan {
  version: string;
  caption_segments: CaptionSegment[];
}

export interface RenderPlan {
  version: string;
  project_id: string;
  video_id: string;
  global_settings: {
    resolution: string;
    aspect_ratio: string;
    default_font: string;
    default_colors: string[];
  };
}

export interface Export {
  id: string;
  project_id: string;
  resolution: string;
  quality: string;
  storage_path?: string;
  download_url?: string;
  render_duration_ms?: number;
  file_size?: number;
  style?: string;
  duration_ms?: number;
  status?: string;
  created_at: string;
}

