import type { MailSender } from './mailSender.js';
import { logError } from './errorLogger.js';

export async function sendReviewRequest(sender: MailSender, to: string, course: { id: string; title: string }, appUrl: string): Promise<boolean> {
  try {
    const url = appUrl.replace(/\/+$/, '');
    await sender.send({ to, subject: `Course to review: ${course.title}`,
      text: `You have been asked to review "${course.title}" on QI Academy.\n\n${url}/courses/${course.id}/edit` });
    return true;
  } catch (error) {
    logError('Unable to send course review request.', error, { courseId: course.id }, 'warn');
    return false;
  }
}
