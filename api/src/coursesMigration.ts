import {
  type Course, courseCategorySchema, courseFromSheetRow, courseLanguageSchema,
  courseSheetHeaders, courseStatusSchema, courseToSheetRow, decodeCourseSheetCell,
} from './course.js';

export type CoursesMigrationSettings = {
  USE_SHARED_SERVICES?: string;
  COURSE_STORE?: string;
  COURSE_STORE_READ_ONLY?: string;
};

/** Marks configuration failures without ever exposing their underlying values. */
export class CoursesMigrationConfigurationError extends Error {}

export interface CoursesMigrationPorts {
  readSheet(): Promise<unknown[][]>;
  readMongo(): Promise<Course[]>;
  ensureMongoIndexes(): Promise<void>;
  upsertMongo(course: Course): Promise<'inserted' | 'updated' | 'unchanged'>;
  updateSheetRow(sheetRowNumber: number, values: string[]): Promise<void>;
  appendSheetRows(rows: string[][]): Promise<void>;
}

export async function runCoursesMigration(
  args: string[], settings: CoursesMigrationSettings,
  open: () => Promise<CoursesMigrationPorts>, write: (line: string) => void,
): Promise<0 | 1> {
  const modes = ['--dry-run', '--apply', '--verify', '--restore-sheet'];
  if (args.length !== 1 || !modes.includes(args[0])) {
    write('Refused: choose exactly one of --dry-run, --apply, --verify, --restore-sheet.');
    return 1;
  }
  const mode = args[0], store = settings.COURSE_STORE ?? 'google-sheets', readOnly = settings.COURSE_STORE_READ_ONLY ?? '0';
  if (settings.USE_SHARED_SERVICES !== '1') {
    write('Refused: USE_SHARED_SERVICES=1 is required for every migration mode.');
    return 1;
  }
  if (!['google-sheets', 'mongodb'].includes(store) || !['0', '1'].includes(readOnly)) {
    write('Refused: COURSE_STORE must be google-sheets or mongodb; COURSE_STORE_READ_ONLY must be 0 or 1.');
    return 1;
  }
  if (mode === '--apply' && (store !== 'google-sheets' || readOnly !== '1')) {
    write('Refused: --apply requires COURSE_STORE=google-sheets and COURSE_STORE_READ_ONLY=1.');
    return 1;
  }
  if (mode === '--restore-sheet' && (store !== 'mongodb' || readOnly !== '1')) {
    write('Refused: --restore-sheet requires COURSE_STORE=mongodb and COURSE_STORE_READ_ONLY=1.');
    return 1;
  }
  try {
    const ports = await open();
    const sheet = validateSheet(await ports.readSheet());
    write('Read and validated Courses sheet.');
    const reportSheet = () => write(`Sheet rows: ${sheet.total}; valid: ${sheet.valid}; invalid: ${sheet.invalid}; duplicate ids: ${sheet.duplicateIds}`);
    if (sheet.issues.length && mode !== '--verify') {
      reportSheet();
      write('Refused: Courses sheet validation failed; no changes were written.');
      for (const issue of sheet.issues) write(issue);
      return 1;
    }
    if (mode === '--dry-run') { reportSheet(); return 0; }

    const mongoCourses = await ports.readMongo();
    write(`Read MongoDB courses: ${mongoCourses.length}.`);
    const mongoIssues = validateMongo(mongoCourses, mode === '--restore-sheet');
    if (mode === '--verify') {
      reportSheet();
      for (const issue of sheet.issues) write(issue);
      return verifyCourses(sheet.comparable, mongoCourses, write, [...sheet.invalidFields,
        ...mongoIssues.map(issue => ({ id: mongoCourses[issue.index]?.id, field: issue.field }))], sheet.issues.length > 0);
    }
    if (mongoIssues.length) {
      reportSheet();
      for (const issue of mongoIssues) write(`Refused: MongoDB course ${issue.index + 1}: invalid or missing ${issue.field}.`);
      return 1;
    }
    if (mode === '--apply') {
      await ports.ensureMongoIndexes();
      write('Created or confirmed MongoDB course catalog index.');
      const counts = { inserted: 0, updated: 0, unchanged: 0 };
      for (const { course } of sheet.courses) counts[await ports.upsertMongo(course)]++;
      write('Copied Courses details to MongoDB.');
      reportSheet();
      write(`inserted: ${counts.inserted}; updated: ${counts.updated}; unchanged: ${counts.unchanged}`);
      return 0;
    }

    const sheetById = new Map(sheet.courses.map(entry => [entry.course.id, entry]));
    const append: Course[] = [];
    let updated = 0, unchanged = 0;
    for (const course of mongoCourses) {
      const existing = sheetById.get(course.id);
      if (!existing) append.push(course);
      else if (sameCourse(existing.course, course)) unchanged++;
      else {
        // Restrict updates to A:U, preserving row order and any operator notes.
        await ports.updateSheetRow(existing.rowNumber, courseToSheetRow(course, { lossless: true }));
        updated++;
      }
    }
    append.sort((left, right) => compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id));
    if (append.length) await ports.appendSheetRows(append.map(course => courseToSheetRow(course, { lossless: true })));
    write('Copied MongoDB courses into Courses sheet.');
    reportSheet();
    write(`Restored sheet: appended: ${append.length}; updated: ${updated}; unchanged: ${unchanged}`);
    return 0;
  } catch (error) {
    // Provider errors can contain connection strings or entire course documents.
    // Preserve the authoritative source and let a frozen rerun reconcile lost acks.
    write(error instanceof CoursesMigrationConfigurationError
      ? 'Migration failed: configuration could not be loaded. Check the allowed settings and required credentials.'
      : 'Migration failed: provider or configuration operation failed. Keep writes frozen; resolve the connection or data issue and rerun, then verify.');
    return 1;
  }
}

type CourseField = typeof courseSheetHeaders[number];
type ComparedCourse = Record<CourseField, unknown> & { id: string };
type InvalidField = { id: unknown; field: string };
type SheetEntry = { course: Course; rowNumber: number };

function validateSheet(rows: unknown[][]) {
  const issues: string[] = [], courses: SheetEntry[] = [], comparable: ComparedCourse[] = [], invalidFields: InvalidField[] = [];
  const invalidRows = new Set<number>(), ids = new Map<string, number[]>();
  const headersMatch = courseSheetHeaders.every((field, index) => rows[0]?.[index] === field);
  if (!headersMatch) issues.push('Row 1: expected Courses headers in columns A:U.');
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2, errors = sheetRowErrors(row);
    if (errors.length) invalidRows.add(rowNumber);
    for (const field of errors) issues.push(`Row ${rowNumber}: invalid or missing ${field}.`);
    // Mapping legitimate legacy blanks uses exactly the existing Course defaults.
    // Invalid raw cells remain invalid for verification rather than disappearing
    // behind the mapper's catch/default behavior.
    const mapped = courseFromSheetRow(row.map((value, column) => errors.includes(courseSheetHeaders[column])
      || value === undefined || value === null ? '' : String(value)));
    if (typeof row[0] === 'string' && row[0].trim()) {
      const numbers = ids.get(row[0]) ?? []; numbers.push(rowNumber); ids.set(row[0], numbers);
      if (headersMatch) {
        const compared: ComparedCourse = { ...mapped };
        for (const field of errors) {
          if (field !== 'id') compared[field] = row[courseSheetHeaders.indexOf(field)];
          invalidFields.push({ id: mapped.id, field });
        }
        comparable.push(compared);
      }
    }
    if (!errors.length) courses.push({ course: mapped, rowNumber });
  });
  let duplicateIds = 0;
  for (const [id, numbers] of ids) {
    if (numbers.length < 2) continue;
    duplicateIds++;
    for (const number of numbers) {
      invalidRows.add(number);
      issues.push(`Row ${number}: duplicate id (rows ${numbers.join(', ')}).`);
    }
    invalidFields.push({ id, field: 'id' });
  }
  const total = Math.max(0, rows.length - 1);
  return { issues, courses, comparable, invalidFields, total, valid: total - invalidRows.size, invalid: invalidRows.size, duplicateIds };
}

function sheetRowErrors(source: unknown[]): CourseField[] {
  const errors = new Set<CourseField>();
  const row = [...source];
  for (const field of courseSheetHeaders) {
    const column = courseSheetHeaders.indexOf(field);
    try {
      // The escape decoder validates the exact type and enum/range of the
      // restored value. Legacy validators below apply to ordinary cells only.
      if (decodeCourseSheetCell(field, row[column], { strict: true })) row[column] = '';
    } catch { errors.add(field); row[column] = ''; }
  }
  const blank = (value: unknown) => value === undefined || value === '' || typeof value === 'string' && !value.trim();
  const text = (index: number) => {
    const value = row[index];
    if (value !== undefined && typeof value !== 'string') errors.add(courseSheetHeaders[index]);
    return typeof value === 'string' ? value : '';
  };
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 18, 19, 20]) text(index);
  if (typeof row[0] !== 'string' || !row[0].trim()) errors.add('id');
  if (!blank(row[6]) && !courseStatusSchema.safeParse(row[6]).success) errors.add('status');
  if (!blank(row[7]) && !Number.isFinite(Date.parse(text(7)))) errors.add('createdAt');
  for (const index of [10, 17]) {
    const value = row[index];
    if (!blank(value) && !((typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value.trim())) &&
      Number.isSafeInteger(Number(value)) && Number(value) >= 0)) errors.add(courseSheetHeaders[index]);
  }
  for (const index of [14, 15]) {
    const value = row[index];
    if (!blank(value) && !(typeof value === 'boolean' || value === 0 || value === 1 ||
      typeof value === 'string' && /^(true|false|yes|no|1|0)$/i.test(value.trim()))) errors.add(courseSheetHeaders[index]);
  }
  const rating = row[16];
  if (!blank(rating) && !((typeof rating === 'number' || typeof rating === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rating.trim())) &&
    Number.isFinite(Number(rating)) && Number(rating) >= 0 && Number(rating) <= 5)) errors.add('rating');
  if (!blank(row[18]) && !courseCategorySchema.safeParse(text(18).trim()).success) errors.add('category');
  if (!blank(row[19]) && text(19).split(',').some(value => !courseLanguageSchema.safeParse(value.trim()).success)) errors.add('languages');
  return [...errors];
}

function validateMongo(courses: Course[], requireRoundTrip: boolean): Array<{ index: number; field: CourseField }> {
  const issues: Array<{ index: number; field: CourseField }> = [], ids = new Set<string>();
  courses.forEach((course, index) => {
    const errors = new Set<CourseField>();
    for (const field of ['id', 'title', 'description', 'level', 'teacher', 'createdAt', 'audience', 'partOfCareer', 'thumbnailAssetId', 'ownerUserId'] as const) {
      if (typeof course?.[field] !== 'string') errors.add(field);
    }
    if (!course || typeof course !== 'object') {
      for (const field of courseSheetHeaders) errors.add(field);
    } else {
      if (typeof course.id !== 'string' || !course.id.trim() || ids.has(course.id)) errors.add('id');
      ids.add(course.id);
      if (typeof course.createdAt === 'string' && course.createdAt !== '' && !Number.isFinite(Date.parse(course.createdAt))) errors.add('createdAt');
      for (const field of ['careerGoals', 'requirements', 'whatYoullLearn'] as const) {
        if (!Array.isArray(course[field]) || course[field].some(value => typeof value !== 'string')) errors.add(field);
      }
      if (!courseStatusSchema.safeParse(course.status).success) errors.add('status');
      if (!courseCategorySchema.safeParse(course.category).success) errors.add('category');
      if (!Array.isArray(course.languages) || course.languages.some(value => !courseLanguageSchema.safeParse(value).success)) errors.add('languages');
      if (typeof course.isPremium !== 'boolean') errors.add('isPremium');
      if (typeof course.isBestseller !== 'boolean') errors.add('isBestseller');
      if (course.priceDkk !== null && !(Number.isSafeInteger(course.priceDkk) && course.priceDkk >= 0)) errors.add('priceDkk');
      if (!(Number.isSafeInteger(course.ratingCount) && course.ratingCount >= 0)) errors.add('ratingCount');
      if (!(typeof course.rating === 'number' && Number.isFinite(course.rating) && course.rating >= 0 && course.rating <= 5)) errors.add('rating');
      if (requireRoundTrip && !errors.size) {
        // Preflight the exact lossless representation before any provider write.
        const restored = courseFromSheetRow(courseToSheetRow(course, { lossless: true }));
        for (const field of courseSheetHeaders) if (!sameValue(course[field], restored[field])) errors.add(field);
      }
    }
    for (const field of errors) issues.push({ index, field });
  });
  return issues;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function sameCourse(left: Course, right: Course): boolean {
  return courseSheetHeaders.every(field => sameValue(left[field], right[field]));
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

function verifyCourses(sheet: ComparedCourse[], mongo: Course[], write: (line: string) => void,
  invalidFields: InvalidField[], blocked: boolean): 0 | 1 {
  const differences = new Set<string>(), ambiguous = new Set<string>();
  const difference = (id: unknown, field: string) => {
    const message = `Difference: id=${JSON.stringify(typeof id === 'string' ? id : '(invalid MongoDB id)')}; field=${field}`;
    if (!differences.has(message)) { differences.add(message); write(message); }
  };
  for (const issue of invalidFields) difference(issue.id, issue.field);
  for (const courses of [sheet, mongo]) {
    const seen = new Set<string>();
    for (const course of courses) {
      if (seen.has(course?.id)) { ambiguous.add(course.id); difference(course.id, 'id'); }
      seen.add(course?.id);
    }
  }
  const mongoById = new Map(mongo.map(course => [course?.id, course])), sheetById = new Map(sheet.map(course => [course.id, course]));
  for (const course of sheet) {
    if (ambiguous.has(course.id)) continue;
    const target = mongoById.get(course.id);
    if (!target) { difference(course.id, 'missingInMongoDB'); continue; }
    for (const field of courseSheetHeaders) if (!sameValue(course[field], target[field])) difference(course.id, field);
  }
  for (const course of mongo) if (!sheetById.has(course?.id)) difference(course?.id, 'missingInSheet');
  if (differences.size || blocked) return 1;
  write(`Verified: ${sheet.length} courses identical`);
  return 0;
}
