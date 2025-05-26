
export interface PhotoAnalysisFeedback {
  id?: string; // AI 피드백 자체를 식별하기 위한 ID (선택적)
  goodPoints: string[];
  areasForImprovement: string[];
  overallImpression?: string;
}

export interface GeminiPhotoAnalysisResponse {
  goodPoints: string[];
  areasForImprovement: string[];
  overallImpression?: string;
}

export enum Status {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  ANALYZING = 'analyzing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export interface ImageFileState {
  file: File | null;
  previewUrl: string | null;
  base64Data: string | null;
  error: string | null;
  rawFileInfo?: string | null; // RAW 파일 관련 정보 메시지
}

// --- New types for Community Feature ---
export enum AppView {
  ANALYZER = 'analyzer', // 기본 사진 분석기 뷰
  COMMUNITY_FEED = 'community_feed', // 커뮤니티 사진 목록 뷰
  PHOTO_DETAIL = 'photo_detail', // 공유된 사진 상세 뷰
}

export interface Comment {
  id: string;
  photoId: string;
  author: string; // 익명 또는 사용자 지정 이름
  text: string;
  timestamp: Date;
}

export interface SharedPhoto {
  id: string;
  uploaderName: string; // 익명 또는 사용자 지정 이름
  imageUrl: string; // base64 data URL
  imageMimeType: string;
  aiFeedback: PhotoAnalysisFeedback | null; // AI가 분석한 피드백
  comments: Comment[];
  sharedAt: Date;
  title?: string; // 사용자가 선택적으로 입력할 수 있는 사진 제목
}

// --- Types for AI Crop Suggestion Feature ---
export interface CropCoordinates {
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
  width: number; // 0.0 to 1.0
  height: number; // 0.0 to 1.0
}

export interface GeminiCropSuggestionResponse {
  crop?: CropCoordinates;
  noSuggestion?: string;
  error?: string;
}

export enum SimpleStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}
