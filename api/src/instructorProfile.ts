import { z } from 'zod';

export const instructorProfileSchema = z.object({ description: z.string().trim().max(280) });
export type InstructorProfileDocument = { _id: string; description: string };
