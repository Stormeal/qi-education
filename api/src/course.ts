import { z } from 'zod';

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

export const createCourseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  level: z.string().trim().min(2).max(80),
  teacher: z.string().trim().min(2).max(120),
  careerGoals: z.array(z.string().trim().min(2).max(80)).default([]),
  status: courseStatusSchema.default('draft')
});

export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export type Course = CreateCourseInput & {
  id: string;
  createdAt: string;
};

export function courseFromSheetRow(row: string[]): Course {
  return {
    id: row[0] ?? '',
    title: row[1] ?? '',
    description: row[2] ?? '',
    level: row[3] ?? '',
    teacher: row[4] ?? '',
    careerGoals: row[5] ? row[5].split(',').map((goal) => goal.trim()).filter(Boolean) : [],
    status: courseStatusSchema.catch('draft').parse(row[6]),
    createdAt: row[7] ?? ''
  };
}

export function courseToSheetRow(course: Course): string[] {
  return [
    course.id,
    course.title,
    course.description,
    course.level,
    course.teacher,
    course.careerGoals.join(', '),
    course.status,
    course.createdAt
  ];
}
