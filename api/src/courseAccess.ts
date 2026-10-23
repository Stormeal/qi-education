import type { AuthenticatedUser } from './auth.js';
import { courseTeacherIds, type Course } from './course.js';
import type { CourseContentDocument } from './courseContentRepository.js';

export function canAuthorCourse(course: Course, user?: AuthenticatedUser): boolean {
  return !!user && (user.role === 'admin' ||
    (user.role === 'teacher' && user.status === 'active' && courseTeacherIds(course).includes(user.id)));
}

export function canLearnCourse(course: Course, user?: AuthenticatedUser, orgCourseIds: readonly string[] = []): boolean {
  return canAuthorCourse(course, user) || (!!user &&
    (['published', 'archived'].includes(course.status) && user.enrolledCourseIds.includes(course.id) ||
      course.status === 'published' && orgCourseIds.includes(course.id)));
}

export function canSeeCourse(course: Course, user?: AuthenticatedUser): boolean {
  return course.status === 'published' || canAuthorCourse(course, user) ||
    (course.status === 'archived' && canLearnCourse(course, user));
}

export function courseOutline(content: CourseContentDocument) {
  return { _id: content._id, view: 'outline' as const, sections: content.sections.map((section) => ({
    id: section.id, title: section.title, components: section.components.map((component) => ({
      id: component.id, title: component.title, type: component.type, durationMinutes: component.durationMinutes,
    })),
  })) };
}

export function learnerCourseContent(content: CourseContentDocument) {
  return { _id: content._id, createdAt: content.createdAt, updatedAt: content.updatedAt, view: 'learner' as const, sections: content.sections.map((section) => ({
    ...section, components: section.components.map((component) => {
      if (component.type !== 'quiz') return component;
      return { ...component, quiz: { ...component.quiz, questions: component.quiz.questions.map((question) => ({
        id: question.id, question: question.question, points: 1,
        image: question.image ? { assetId: question.image.assetId, alt: question.image.alt } : null,
        multiple: question.answers.filter(answer => answer.isCorrect).length > 1,
        answers: question.answers.map((answer) => ({ id: answer.id, text: answer.text, description: '' })),
      })) } };
    }),
  })) };
}
