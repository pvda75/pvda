export type Answers = { [key: string]: string };

export enum AppState {
  START_SCREEN,
  LOADING_SESSION_FROM_URL,
  TEACHER_LOGIN,
  TEACHER_DASHBOARD,
  PENDING_APPROVAL,
  ADMIN_DASHBOARD,
  STUDENT_UPLOAD_SESSION,
  STUDENT_AWAIT_FULLSCREEN,
  TEACHER_SETUP,
  STUDENT_ENTRY,
  TEST_TAKING,
  SUBMISSION_SUCCESS,
  ALL_RESULTS,
  STUDENT_REVIEW,
  LOCKED,
  TEST_COMPLETED,
}

export interface TestVersion {
  id: string;
  testFile?: File;
  testContent?: string;
  answerKeyFile?: File;
  correctAnswers: Answers;
  isAIGenerated?: boolean;
}

export interface StudentInfo {
  studentId: string;
  name: string;
  class: string;
}

export interface ScoreConfig {
  mcPoints: number; // Points per MC question
  tfPoints: number; // Points per TF part
  saPoints: number; // Points per SA question
  frPoints: number; // Points per FR question
  totalScore: number; // Maximum total score for scaling (optional)
  allowMultipleAttempts?: boolean; // Allow students to take the test multiple times
}

export interface StudentResult {
  id?: string;
  sessionId?: string;
  studentId?: string;
  name: string;
  class: string;
  additionalData?: Record<string, string>;
  answers: Answers;
  testVersionId: string;
  submissionTime: string;
  submissionType?: 'manual' | 'auto_visibility' | 'auto_timeout' | 'auto_violation' | 'auto_esc';
  score?: number;
  violationCount?: number;
}

export interface User {
  username: string;
  password?: string;
  role: 'teacher' | 'student' | 'admin' | 'pending' | 'locked';
}

export interface TestInfo {
  versions: {
    id: string;
    fileName?: string;
    answerKeyFileName?: string;
  }[];
  mc: number;
  tf: number;
  sa: number;
  fr: number;
  duration: number;
  startTime: string;
  endTime: string;
  allowedStudents?: {studentId: string; name: string; class: string}[];
  additionalStudentFields?: string[];
}
