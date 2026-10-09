import { CourseComponentType } from '../app.models';

// Keep in step with the API upload limit (api/src/server.ts); the host caps bodies near 4.5 MB.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Why this file cannot be attached to a lesson of this type, or '' when it can. */
export function attachmentProblem(type: CourseComponentType, file: File): string {
  if (!isAllowedComponentAttachment(type, file)) {
    return type === 'text'
      ? 'Text documentation supports documents, PDFs, images, and PowerPoint files.'
      : 'Resources supports ZIP files, PowerPoint files, and images.';
  }

  return file.size > MAX_ATTACHMENT_BYTES ? 'Attachments must be 4 MB or smaller.' : '';
}

function isAllowedComponentAttachment(type: CourseComponentType, file: File): boolean {
  const contentType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isImage =
    contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension);
  const isPowerPoint =
    [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ].includes(contentType) || ['ppt', 'pptx'].includes(extension);

  if (type === 'resources') {
    return (
      isImage ||
      isPowerPoint ||
      ['application/zip', 'application/x-zip-compressed'].includes(contentType) ||
      extension === 'zip'
    );
  }

  return (
    isImage ||
    isPowerPoint ||
    contentType === 'application/pdf' ||
    contentType === 'text/plain' ||
    contentType === 'application/msword' ||
    contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ['pdf', 'txt', 'doc', 'docx'].includes(extension)
  );
}
