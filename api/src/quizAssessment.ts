import { z } from 'zod';
import type { CourseContentComponent, CourseContentSection } from './courseContent.js';

export type AssessmentIssue = { sectionId: string; componentId: string; questionId?: string; message: string };

export function assessmentIssues(sections: CourseContentSection[], ready: boolean, options: { forAttempt?: boolean } = {}): AssessmentIssue[] {
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
        if (question.answers.length < 2 || question.answers.length > 6) issue(prefix + 'Add between two and six answers.', question.id);
        if (question.answers.some((answer) => !answer.text.trim())) issue(prefix + 'Fill in every answer.', question.id);
        if (!question.answers.some((answer) => answer.isCorrect)) {
          issue(prefix + 'Mark at least one correct answer.', question.id);
        }
      }
      const totalPoints = component.quiz.questions.length;
      if (ready && (component.quiz.passPoints < 1 || (!options.forAttempt && component.quiz.passPoints > totalPoints))) {
        issue(`Pass mark must be between 1 and ${totalPoints} available questions.`);
      }
    }
  }
  return issues;
}

const selectedIdSchema = z.string().trim().min(1).max(120);
export const quizAttemptSchema = z.object({
  sectionId: z.string().trim().min(1).max(120),
  answers: z.array(z.preprocess(value => {
    // The selected array is authoritative; do not validate an unused legacy alias.
    if (value && typeof value === 'object' && 'answerIds' in value && value.answerIds !== undefined) {
      return { ...value, answerId: undefined };
    }
    return value;
  }, z.object({ questionId: selectedIdSchema,
    answerIds: z.array(selectedIdSchema).min(1).max(50).optional(), answerId: selectedIdSchema.optional(),
  })).refine(selection => selection.answerIds !== undefined || selection.answerId !== undefined,
    { message: 'Select at least one answer.' })
    .transform(selection => ({ questionId: selection.questionId,
      answerIds: [...new Set(selection.answerIds ?? [selection.answerId!])] }))).max(50),
});

export function scoreQuiz(component: Extract<CourseContentComponent, { type: 'quiz' }>, answers: z.infer<typeof quizAttemptSchema>['answers']) {
  const seen = new Set<string>();
  const feedback: { questionId: string; answerIds: string[]; answerId: string; correct: boolean; explanation: string; description: string }[] = [];
  let score = 0;
  for (const selection of answers) {
    if (seen.has(selection.questionId)) return null;
    seen.add(selection.questionId);
    const question = component.quiz.questions.find((item) => item.id === selection.questionId);
    const answerIds = [...new Set(selection.answerIds)];
    if (!question || !answerIds.length || answerIds.some(id => !question.answers.some(answer => answer.id === id))) return null;
    const correctIds = new Set(question.answers.filter(answer => answer.isCorrect).map(answer => answer.id));
    const correct = answerIds.length === correctIds.size && answerIds.every(id => correctIds.has(id));
    if (correct) score++;
    const answerId = answerIds[0];
    const explanation = question.explanation ?? '';
    feedback.push({ questionId: selection.questionId, answerIds, answerId, correct, explanation,
      description: explanation || question.answers.find(answer => answer.id === answerId)!.description });
  }
  const totalPoints = component.quiz.questions.length;
  return { score, totalPoints, passPoints: component.quiz.passPoints,
    passed: score >= Math.min(component.quiz.passPoints, totalPoints), feedback };
}
