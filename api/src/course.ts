import { z } from 'zod';

export const courseStatusSchema = z.enum(['draft', 'ready-for-review', 'published', 'archived']);

export const courseCategorySchema = z.enum([
  'Software Testing',
  'Automation Testing',
  'Performance Testing',
  'API Testing',
  'Mobile Testing',
  'Security Testing',
  'Test Management',
  'Uncategorized',
]);

export const courseLanguageSchema = z.enum(['English', 'Danish', 'German', 'Swedish', 'Norwegian']);

export const courseSheetHeaders = [
  'id',
  'title',
  'description',
  'level',
  'teacher',
  'careerGoals',
  'status',
  'createdAt',
  'requirements',
  'audience',
  'priceDkk',
  'partOfCareer',
  'whatYoullLearn',
  'thumbnailAssetId',
  'isPremium',
  'isBestseller',
  'rating',
  'ratingCount',
  'category',
  'languages',
] as const;

export const createCourseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  requirements: z.array(z.string().trim().min(2).max(160)).default([]),
  whatYoullLearn: z.array(z.string().trim().min(2).max(160)).default([]),
  audience: z.string().trim().max(1000).default(''),
  level: z.string().trim().min(2).max(80),
  partOfCareer: z.string().trim().max(120).default(''),
  teacher: z.string().trim().min(2).max(120),
  careerGoals: z.array(z.string().trim().min(2).max(80)).default([]),
  status: courseStatusSchema.default('draft'),
  priceDkk: z.number().int().nonnegative().nullable().default(null),
  thumbnailAssetId: z.string().trim().max(120).default(''),
  isPremium: z.boolean().default(false),
  isBestseller: z.boolean().default(false),
  rating: z.number().min(0).max(5).default(0),
  ratingCount: z.number().int().nonnegative().default(0),
  category: courseCategorySchema.default('Uncategorized'),
  languages: z.array(courseLanguageSchema).default([]),
});

export const updateCourseSchema = createCourseSchema.omit({
  thumbnailAssetId: true,
  isPremium: true,
  isBestseller: true,
  rating: true,
  ratingCount: true,
  category: true,
  languages: true,
});
export const updateCoursePriceSchema = z.object({
  priceDkk: z.number().int().nonnegative().nullable(),
});
export const updateCourseCatalogMetadataSchema = z.object({
  isPremium: z.boolean(),
  isBestseller: z.boolean(),
  rating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  category: courseCategorySchema,
  languages: z.array(courseLanguageSchema),
});
export const updateCourseThumbnailSchema = z.object({
  thumbnailAssetId: z.string().trim().max(120).default(''),
});

export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type CourseCategory = z.infer<typeof courseCategorySchema>;
export type CourseLanguage = z.infer<typeof courseLanguageSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpdateCoursePriceInput = z.infer<typeof updateCoursePriceSchema>;
export type UpdateCourseCatalogMetadataInput = z.infer<typeof updateCourseCatalogMetadataSchema>;
export type UpdateCourseThumbnailInput = z.infer<typeof updateCourseThumbnailSchema>;

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
    createdAt: row[7] ?? '',
    requirements: row[8] ? row[8].split('\n').map((requirement) => requirement.trim()).filter(Boolean) : [],
    audience: row[9] ?? '',
    priceDkk: parsePriceDkk(row[10]),
    partOfCareer: row[11] ?? '',
    whatYoullLearn: row[12] ? row[12].split('\n').map((item) => item.trim()).filter(Boolean) : [],
    thumbnailAssetId: row[13] ?? '',
    isPremium: parseBooleanFlag(row[14]),
    isBestseller: parseBooleanFlag(row[15]),
    rating: parseRating(row[16]),
    ratingCount: parseRatingCount(row[17]),
    category: courseCategorySchema.catch('Uncategorized').parse(row[18]?.trim() || 'Uncategorized'),
    languages: parseLanguages(row[19]),
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
    course.createdAt,
    course.requirements.join('\n'),
    course.audience,
    course.priceDkk === null ? '' : String(course.priceDkk),
    course.partOfCareer,
    course.whatYoullLearn.join('\n'),
    course.thumbnailAssetId,
    course.isPremium ? 'TRUE' : 'FALSE',
    course.isBestseller ? 'TRUE' : 'FALSE',
    formatRating(course.rating),
    String(course.ratingCount),
    course.category,
    course.languages.join(', '),
  ];
}

function parsePriceDkk(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseBooleanFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function parseRating(value: string | undefined): number {
  if (!value?.trim()) {
    return 0;
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(5, Math.max(0, Math.round(parsed * 10) / 10));
}

function parseLanguages(value: string | undefined): Course['languages'] {
  if (!value?.trim()) {
    return [];
  }

  const seen = new Set<Course['languages'][number]>();

  for (const candidate of value.split(',').map((entry) => entry.trim())) {
    const parsed = courseLanguageSchema.safeParse(candidate);
    if (parsed.success) {
      seen.add(parsed.data);
    }
  }

  return [...seen];
}

function parseRatingCount(value: string | undefined): number {
  if (!value?.trim()) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatRating(value: number): string {
  return (Math.round(Math.min(5, Math.max(0, value)) * 10) / 10).toFixed(1);
}
