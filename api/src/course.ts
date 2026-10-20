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

export const courseLanguageSchema = z.enum(['English', 'Danish']);

export const courseFields = [
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
  'ownerUserId',
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
export const coursePriceMessage = 'Enter 0 for free, or a whole number of DKK from 3 to 999,999.';
export const coursePriceDkkSchema = z.number().int().min(0).max(999999).refine(value => value === 0 || value >= 3).nullable();
export const updateCoursePriceSchema = z.object({ priceDkk: coursePriceDkkSchema });
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
  ownerUserId: string;
};
