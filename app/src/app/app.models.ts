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
  audience: string;
  level: string;
  teacher: string;
  careerGoals: string[];
  status: CourseStatus;
  createdAt: string;
};

export type CourseCreateDraft = {
  title: string;
  description: string;
  requirements: string;
  audience: string;
  level: string;
  teacher: string;
  careerGoals: string;
  status: CourseStatus;
};

export type CourseComponentType = 'video' | 'quiz' | 'text';

export type CourseComponent = {
  id: string;
  title: string;
  type: CourseComponentType;
  durationMinutes: number;
  content: string;
  resourceUrl: string;
};

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
