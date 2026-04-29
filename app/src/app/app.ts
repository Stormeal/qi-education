import { Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly student = signal({
    name: 'Alex',
    currentRole: 'Manual tester',
    targetRole: 'ISTQB Advanced Test Analyst',
    pathProgress: 38,
  });

  protected readonly courses = signal([
    {
      title: 'ISTQB Foundation 4.0',
      teacher: 'Testhuset',
      level: 'Foundation',
      status: 'In progress',
      progress: 62,
      nextLesson: 'Test techniques overview',
      goals: ['Core testing', 'Certification'],
    },
    {
      title: 'Agile Tester Extension',
      teacher: 'Testhuset',
      level: 'Specialist',
      status: 'Recommended',
      progress: 0,
      nextLesson: 'Agile testing mindset',
      goals: ['Agile projects', 'Team quality'],
    },
    {
      title: 'Test Management Basics',
      teacher: 'Testhuset',
      level: 'Management',
      status: 'Recommended',
      progress: 0,
      nextLesson: 'Planning risk-based test work',
      goals: ['Risk', 'Leadership'],
    },
  ]);

  protected readonly nextActions = signal([
    {
      title: 'Finish Foundation chapter',
      meta: 'Test analysis and design',
      tone: 'orange',
    },
    {
      title: 'Pick a specialization track',
      meta: 'Agile, technical, or management',
      tone: 'pink',
    },
    {
      title: 'Book exam preparation',
      meta: 'Recommended before certification',
      tone: 'green',
    },
  ]);

  protected readonly pathStages = signal([
    {
      title: 'Foundation',
      detail: 'ISTQB Foundation 4.0',
      state: 'complete',
    },
    {
      title: 'Specialize',
      detail: 'Agile testing or technical testing',
      state: 'current',
    },
    {
      title: 'Advance',
      detail: 'Test Analyst, Test Manager, or automation',
      state: 'next',
    },
  ]);

  protected readonly activeCourse = computed(
    () => this.courses().find((course) => course.status === 'In progress') ?? this.courses()[0],
  );

  protected readonly recommendedCourses = computed(() =>
    this.courses().filter((course) => course.status === 'Recommended'),
  );
}
