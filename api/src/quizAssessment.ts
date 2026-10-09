import { z } from 'zod';
import type { CourseContentComponent, CourseContentSection } from './courseContent.js';

export type AssessmentIssue = { sectionId: string; componentId: string; questionId?: string; message: string };

export function assessmentIssues(sections: CourseContentSection[], ready: boolean): AssessmentIssue[] {
  const issues: AssessmentIssue[] = [];
  const sectionIds = new Set<string>();
  const componentIds = new Set<string>();
  for (const section of sections) {
    if (sectionIds.has(section.id)) issues.push({ sectionId: section.id, componentId: '', message: 'Section IDs must be unique.' });
    sectionIds.add(section.id);
    for (const component of section.components) {
      const issue = (message: string, questionId?: string) => issues.push({ sectionId: section.id, componentId: component.id,
        ...(questionId ? { questionId } : {}), message: `${component.title}: ${message}` });
      if (componentIds.has(component.id)) issue('Component IDs must be unique.');
      componentIds.add(component.id);
      if (component.type !== 'quiz') continue;
      const questionIds = new Set<string>();
      if (ready && component.quiz.questions.length === 0) issue('Add at least one question.');
      for (const [index, question] of component.quiz.questions.entries()) {
        const prefix = `Question ${index + 1}: `;
        if (questionIds.has(question.id)) issue(prefix + 'Question IDs must be unique.', question.id);
        questionIds.add(question.id);
        if (new Set(question.answers.map((answer) => answer.id)).size !== question.answers.length) {
          issue(prefix + 'Answer IDs must be unique within the question.', question.id);
        }
        if (!ready) continue;
        if (!question.question.trim()) issue(prefix + 'Enter a question.', question.id);
        if (question.answers.some((answer) => !answer.text.trim())) issue(prefix + 'Fill in all four answers.', question.id);
        if (question.answers.filter((answer) => answer.isCorrect).length !== 1) {
          issue(prefix + 'Mark exactly one correct answer.', question.id);
        }
      }
      const totalPoints = component.quiz.questions.reduce((sum, question) => sum + question.points, 0);
      if (ready && component.quiz.passPoints > totalPoints) issue(`Pass mark must not exceed ${totalPoints} available points.`);
    }
  }
  return issues;
}

export const quizAttemptSchema = z.object({
  sectionId: z.string().trim().min(1).max(120),
  answers: z.array(z.object({ questionId: z.string().trim().min(1).max(120), answerId: z.string().trim().min(1).max(120) })).max(50),
});

export function scoreQuiz(component: Extract<CourseContentComponent, { type: 'quiz' }>, answers: z.infer<typeof quizAttemptSchema>['answers']) {
  const seen = new Set<string>();
  const feedback: { questionId: string; answerId: string; correct: boolean; description: string }[] = [];
  let score = 0;
  for (const selection of answers) {
    if (seen.has(selection.questionId)) return null;
    seen.add(selection.questionId);
    const question = component.quiz.questions.find((item) => item.id === selection.questionId);
    const answer = question?.answers.find((item) => item.id === selection.answerId);
    if (!question || !answer) return null;
    if (answer.isCorrect) score += question.points;
    feedback.push({ ...selection, correct: answer.isCorrect, description: answer.description });
  }
  return { score, totalPoints: component.quiz.questions.reduce((sum, question) => sum + question.points, 0),
    passPoints: component.quiz.passPoints, passed: score >= component.quiz.passPoints, feedback };
}
