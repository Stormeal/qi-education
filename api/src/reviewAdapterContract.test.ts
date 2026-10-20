import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { reviewedRepositories } from './courseReview.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { createCourseSchema } from './course.js';

it('DEF-055 installed review adapter exposes non-null update results to callers', () => {
  // Inspect the exported type with the compiler: callers must not inherit the
  // nullable raw repository contract after installing the review adapter.
  const file = fileURLToPath(new URL('./courseReview.ts', import.meta.url));
  const program = ts.createProgram([file], { strict: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const source = program.getSourceFile(file)!;
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reviewedRepositories') as ts.FunctionDeclaration;
  const checker = program.getTypeChecker();
  const signature = checker.getSignatureFromDeclaration(declaration)!;
  const result = checker.getReturnTypeOfSignature(signature);
  const courses = checker.getTypeOfSymbolAtLocation(result.getProperty('courses')!, declaration);
  for (const method of ['updateCourse', 'updateCourseThumbnail']) {
    const type = checker.getTypeOfSymbolAtLocation(courses.getProperty(method)!, declaration);
    const returned = checker.getReturnTypeOfSignature(checker.getSignaturesOfType(type, ts.SignatureKind.Call)[0]);
    const awaited = checker.getAwaitedType(returned)!;
    const members = awaited.isUnion() ? awaited.types : [awaited];
    expect(members.some(member => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any)) !== 0), method).toBe(false);
  }
}, 20000);

it('DEF-055 review updates return a course or throw a genuine missing-course 404', async () => {
  const metadata = new InMemoryCourseRepository();
  const input = createCourseSchema.parse({ title: 'Review adapter', description: 'Review contract fixture.', level: 'Beginner', teacher: 'Teacher' });
  await metadata.createCourse(input, { id: 'fixture', ownerUserId: 'teacher', createdAt: '2026-10-20' });
  const { courses } = reviewedRepositories(metadata, new InMemoryCourseContentRepository(), new InMemoryCourseAssetRepository());
  expect(await courses.updateCourse('fixture', input)).toMatchObject({ id: 'fixture' });
  expect(await courses.updateCourseThumbnail('fixture', { thumbnailAssetId: 'asset' })).toMatchObject({ id: 'fixture', thumbnailAssetId: 'asset' });
  await expect(courses.updateCourse('missing', input)).rejects.toMatchObject({ status: 404 });
  await expect(courses.updateCourseThumbnail('missing', { thumbnailAssetId: 'asset' })).rejects.toMatchObject({ status: 404 });
});
