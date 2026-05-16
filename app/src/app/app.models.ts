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

export type LoginState = {
  token: string;
  user: LoginResponse['user'];
  permissions: LoginResponse['permissions'];
};

export type StudentSummary = {
  name: string;
  currentRole: string;
  targetRole: string;
  pathProgress: number;
};

export type CourseSummary = {
  title: string;
  teacher: string;
  level: string;
  status: string;
  progress: number;
  nextLesson: string;
  goals: string[];
};

export type CourseStatus = 'draft' | 'ready-for-review' | 'published' | 'archived';

export type CourseListItem = {
  id: string;
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

export type CourseComponentType = 'video' | 'quiz' | 'text';

export type QuizAnswerOption = {
  id: string;
  text: string;
  description: string;
  isCorrect: boolean;
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
};

export type VideoCourseComponent = BaseCourseComponent & {
  type: 'video';
};

export type TextCourseComponent = BaseCourseComponent & {
  type: 'text';
};

export type QuizCourseComponent = BaseCourseComponent & {
  type: 'quiz';
  quiz: QuizComponentContent;
};

export type CourseComponent = VideoCourseComponent | TextCourseComponent | QuizCourseComponent;

export type CourseSection = {
  id: string;
  title: string;
  components: CourseComponent[];
};

export type CourseContentDocument = {
  _id: string;
  sections: CourseSection[];
  createdAt: string;
  updatedAt: string;
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
};

export type FeedbackTriageUpdate = {
  id: string;
  workStatus: NonNullable<FeedbackEntry['workStatus']>;
  priority?: FeedbackEntry['priority'];
};
