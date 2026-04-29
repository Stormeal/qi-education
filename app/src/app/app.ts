import { Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly courses = signal([
    {
      title: 'Career Discovery Workshop',
      teacher: 'QI Education',
      level: 'Beginner',
      status: 'Published',
      goals: ['Career change', 'Skill mapping']
    },
    {
      title: 'Practical AI Foundations',
      teacher: 'Teacher team',
      level: 'Intermediate',
      status: 'Draft',
      goals: ['Automation', 'Productivity']
    }
  ]);

  protected readonly publishedCourses = computed(
    () => this.courses().filter((course) => course.status === 'Published').length
  );
}
