export type Source = "briefing" | "permit";

export interface Hazard {
  item: string;
  control: string;
  source: Source;
}

export interface QuizItem {
  q: string;
  expected_answer: string;
}

export interface Briefing {
  site: string;
  date?: string;
  hazards: Hazard[];
  ppe: string[];
  tasks: { crew: string; task: string }[];
  emergency: { assembly_point: string; contact: string };
  quiz: QuizItem[];
}

export interface Gap {
  missing: string;
  permit_line: string;
  severity: "high" | "med" | "low";
}

export interface LocalQuiz extends QuizItem {
  q_local: string;
  audioUrl: string;
}

export interface Localised {
  lang: string;
  lines: string[];
  scriptEn: string[];
  audioUrl: string;
  quiz: LocalQuiz[];
}

export interface BriefingRecord {
  id: string;
  createdAt: string;
  transcript: string;
  permitText: string;
  briefing: Briefing;
  gaps: Gap[];
  localised: Record<string, Localised>;
  demo?: boolean;
}

export type Verdict = "understood" | "partial" | "not_understood";

export interface AckEvent {
  worker: string;
  language: string;
  briefingId: string;
  event: "heard" | "answer" | "rebrief";
  at: string;
  question?: string;
  transcript?: string;
  verdict?: Verdict;
  reason?: string;
}

export type WorkerStatus = "understood" | "partial" | "re-brief" | "heard" | "absent";

export interface GridRow {
  worker: string;
  language: string;
  status: WorkerStatus;
  answer: string;
  reason: string;
  updated: string;
}
