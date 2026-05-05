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
