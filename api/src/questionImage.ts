import type { CourseAssetRepository } from './courseAssetRepository.js';
import type { CourseContentSection } from './courseContent.js';

export const isQuestionImageContentType = (value: string): boolean =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(value);

export async function questionImageIssue(sections: CourseContentSection[], courseId: string,
  assets: Pick<CourseAssetRepository, 'getComponentAttachmentMetadata'>): Promise<string | null> {
  const references = sections.flatMap(section => section.components.flatMap(component =>
    component.type !== 'quiz' ? [] : component.quiz.questions.flatMap((question, index) =>
      question.image ? [{ component, image: question.image, index }] : [])));
  if (!references.length) return null;
  // Validate projected stored metadata, never client assertions or the image binary.
  const metadata = new Map(await Promise.all([...new Set(references.map(ref => ref.image.assetId))]
    .map(async id => [id, await assets.getComponentAttachmentMetadata(id)] as const)));
  for (const { component, image, index } of references) {
    const attached = component.attachments.find(attachment => attachment.assetId === image.assetId);
    const stored = metadata.get(image.assetId);
    if (!attached || !isQuestionImageContentType(attached.contentType) || !stored ||
      stored.courseId !== courseId || stored.componentId !== component.id || !isQuestionImageContentType(stored.contentType)) {
      return `${component.title}: Question ${index + 1}: Image must reference a JPEG, PNG or WebP attachment of this quiz lesson.`;
    }
  }
  return null;
}
