import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AppStateService } from '../../services/app-state.service';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';
import { TabItem, Tabs, tabId, tabPanelId } from '../../ui/tabs/tabs';
import { RELEASE_NOTES } from './release-notes';

// Teacher/admin copy of the roadmap Alex agreed on 2026-10-23 (docs/user_stories.md, Releases).
// Management decisions (budget, staffing) are left out on purpose.
const RELEASES = [
  { name: 'Release 1, internal', when: 'Mid-December 2026', current: true, points: [
    'Colleagues learn and teachers build courses',
    'Hosting and data fit for company use',
    'Career routes mapped to our courses',
    'Organizations: request, approval, invitations and members',
    'No public sales yet',
  ] },
  { name: 'Release 2, public launch', when: 'Around Q2 2027', current: false, points: [
    'Live card payments in DKK',
    "Organization owners follow their members' progress",
    'External security test and accessibility review',
    'Catalog filled with the courses built in release 1',
  ] },
  { name: 'Release 3, organization billing', when: 'After launch, 2027', current: false, points: [
    'Monthly seats per career',
    'Course add-ons, card or invoice',
    'Owner billing overview',
  ] },
];

const RELEASE_1_GROUPS = [
  { title: 'Ready for colleagues', items: [
    { name: 'Colleagues get courses for free', must: true, detail: 'Courses stay free during the internal period; public prices are set at launch. Anyone enrolled before a price is set keeps free access.' },
    { name: 'Live-site walkthrough for teachers', must: true, detail: 'The teacher rehearsal and the open release checks run on the live site: video, email confirmation, CV scan and phone layouts.' },
    { name: 'Career routes mapped to our courses', must: true, detail: 'Every TestHuset course is mapped to a route or deferred with a reason.' },
    { name: 'Route changes keep earned achievements', must: false, detail: 'Routes will change while courses are built; learners keep their recorded progress.' },
    { name: 'Feedback reaches us once', must: false, detail: 'Feedback follow-ups no longer create duplicate GitHub issues after a restart.' },
  ] },
  { title: 'Organizations', items: [
    { name: 'Request an organization', must: true, detail: 'Any user asks for an organization and a site admin approves or declines it with a reason. The requester becomes its owner.' },
    { name: 'Invite people', must: true, detail: 'Owners invite by email. Invitations expire after 14 days and can be resent or cancelled.' },
    { name: 'Members', must: true, detail: 'Member list, remove a member, leave an organization. Progress and own courses stay with the person.' },
    { name: 'Careers, add-ons and prices', must: true, detail: 'Owners assign careers and approve extra courses; admins set prices. Prices are shown, nothing is charged until billing.' },
    { name: 'Site admin overview', must: true, detail: 'All organizations and pending requests; suspend an organization.' },
  ] },
  { title: 'Safe to run', items: [
    { name: 'Paid hosting', must: true, detail: 'Hosting and database plans that allow company use, with backups.' },
    { name: 'Private code repository', must: true, detail: 'The code moves to a private repository; the site keeps publishing from it.' },
    { name: 'Employee data handled correctly (GDPR)', must: true, detail: 'EU data region, data processing agreements and a reviewed privacy notice.' },
    { name: 'Remaining server security findings', must: false, detail: 'Open findings from the October dependency report that affect the running server are fixed.' },
  ] },
];

@Component({
  selector: 'app-roadmap-page',
  imports: [DatePipe, FeedbackDialog, PageHeader, Tabs],
  templateUrl: './roadmap-page.html',
  styleUrls: ['../../app.scss', './roadmap-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadmapPage {
  protected readonly state = inject(AppStateService);
  protected readonly releases = RELEASES;
  protected readonly groups = RELEASE_1_GROUPS;
  protected readonly releaseNotes = RELEASE_NOTES;
  protected readonly tabId = tabId;
  protected readonly tabPanelId = tabPanelId;
  protected readonly tabs: TabItem[] = [
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'release-notes', label: 'Release notes' },
  ];
  protected readonly activeTab = signal('roadmap');
}
