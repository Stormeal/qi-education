export type UserRole = 'student' | 'teacher' | 'admin';

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    status: 'active' | 'disabled';
    createdAt: string;
    enrolledCourseIds: string[];
  };
  permissions: {
    canCreateCourses: boolean;
    hasAdminAccess: boolean;
  };
};

export type SignupRequest = {
  displayName: string;
  email: string;
  password: string;
};

export type LoginState = {
  token: string;
  user: LoginResponse['user'];
  permissions: LoginResponse['permissions'];
};

export type StudentSummary = {
  name: string;
  currentRole: string;
  targetRole: string;
  pathProgress: number | null;
};

export type UserProfileDetails = {
  bio: string;
  jobTitle: string;
  company: string;
  learningGoals: string;
  avatarColor: string;
};

export type CourseSummary = {
  id: string;
  title: string;
  teacher: string;
  level: string;
  status: string;
  progress: number | null;
  progressState: 'loading' | 'ready' | 'error';
  completed: number;
  total: number;
  nextLesson: string;
  goals: string[];
};

export type CourseStatus = 'draft' | 'ready-for-review' | 'published' | 'archived';

export const COURSE_CATEGORIES = [
  'Software Testing',
  'Automation Testing',
  'Performance Testing',
  'API Testing',
  'Mobile Testing',
  'Security Testing',
  'Test Management',
  'Uncategorized',
] as const;

export const COURSE_LANGUAGES = ['English', 'Danish'] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];
export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

export type CourseListItem = {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  requirements: string[];
  whatYoullLearn: string[];
  audience: string;
  level: string;
  partOfCareer: string;
  teacher: string;
  careerGoals: string[];
  status: CourseStatus;
  createdAt: string;
  priceDkk: number | null;
  thumbnailAssetId: string;
  isPremium: boolean;
  isBestseller: boolean;
  rating: number;
  ratingCount: number;
  category: CourseCategory;
  languages: CourseLanguage[];
};

export type CourseCatalogMetadataDraft = {
  isPremium: boolean;
  isBestseller: boolean;
  rating: number;
  ratingCount: number;
  category: CourseCategory;
  languages: CourseLanguage[];
};

export type CourseCreateDraft = {
  title: string;
  description: string;
  requirements: string;
  whatYoullLearn: string;
  audience: string;
  level: string;
  partOfCareer: string;
  teacher: string;
  careerGoals: string;
  status: CourseStatus;
  priceDkk: number | null;
};

export type CourseComponentType = 'video' | 'quiz' | 'text' | 'resources';

export type MuxPlaybackPolicy = 'public' | 'signed';

export type MuxVideoStatus = 'waiting' | 'uploading' | 'processing' | 'ready' | 'errored';

export type MuxVideo = {
  provider: 'mux';
  uploadId: string;
  assetId: string;
  playbackId: string;
  playbackPolicy: MuxPlaybackPolicy;
  status: MuxVideoStatus;
  durationSeconds: number | null;
  thumbnailUrl: string;
  errorMessage: string;
  captions: Array<{
    id: string;
    languageCode: string;
    name: string;
    status: 'ready' | 'processing' | 'errored';
  }>;
};

export type QuizAnswerOption = {
  id: string;
  text: string;
  description?: string;
  isCorrect?: boolean;
};

export type QuizQuestion = {
  id: string;
  question: string;
  points: number;
  answers: [QuizAnswerOption, QuizAnswerOption, QuizAnswerOption, QuizAnswerOption];
};

export type QuizComponentContent = {
  passPoints: number;
  questions: QuizQuestion[];
};

type BaseCourseComponent = {
  id: string;
  title: string;
  durationMinutes: number;
  content: string;
  resourceUrl: string;
  attachments: CourseComponentAttachment[];
};

export type CourseComponentAttachment = {
  id: string;
  assetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type VideoCourseComponent = BaseCourseComponent & {
  type: 'video';
  mux?: MuxVideo;
};

export type TextCourseComponent = BaseCourseComponent & {
  type: 'text';
};

export type QuizCourseComponent = BaseCourseComponent & {
  type: 'quiz';
  quiz: QuizComponentContent;
};

export type ResourcesCourseComponent = BaseCourseComponent & {
  type: 'resources';
};

export type CourseComponent =
  | VideoCourseComponent
  | TextCourseComponent
  | QuizCourseComponent
  | ResourcesCourseComponent;

export type CourseSection = {
  id: string;
  title: string;
  components: CourseComponent[];
};

export type CourseReviewAction = 'start-revision' | 'submit' | 'return' | 'publish' | 'archive';
export type CourseReviewState = {
  course: CourseListItem; version: number; revisionId: string | null;
  liveStatus: 'published' | 'archived' | null; editable: boolean;
  history: { id: string; revisionId: string | null; action: string; actorId: string; actorName: string; createdAt: string; reason: string }[];
};

export type CourseContentDocument = {
  _id: string;
  view?: 'outline' | 'learner' | 'author';
  sections: CourseSection[];
  createdAt: string;
  updatedAt: string;
  review?: CourseReviewState;
};

export type QuizAssessmentResult = {
  score: number;
  totalPoints: number;
  passPoints: number;
  passed: boolean;
  feedback: { questionId: string; answerId: string; correct: boolean; description: string }[];
};

export type NextAction = {
  title: string;
  chapter: string;
  meta: string;
  state: 'complete' | 'current' | 'next';
  progress: number;
};

export type FeedbackOption = {
  value: string;
  icon: string;
  label: string;
};

export type FeedbackEntry = {
  id: string;
  createdAt: string;
  userId: string;
  userEmail: string;
  userRole: string;
  page: string;
  rating: 'great' | 'okay' | 'needs-work';
  message: string;
  userAgent?: string;
  workStatus?: 'work' | 'completed' | 'wont-do';
  priority?: 'low' | 'medium' | 'high';
  githubIssueNumber?: number;
  githubIssueUrl?: string;
};

export type FeedbackTriageUpdate = {
  id: string;
  workStatus: NonNullable<FeedbackEntry['workStatus']>;
  priority?: FeedbackEntry['priority'];
};
