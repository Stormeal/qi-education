import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ProfileMenu } from './profile-menu';

describe('ProfileMenu', () => {
  it('navigates to /profile when the Profile item is clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileMenu],
      providers: [provideRouter([])],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(ProfileMenu);
    fixture.componentRef.setInput('displayName', 'Alex Storm');
    fixture.componentRef.setInput('email', 'alex@example.com');
    fixture.componentRef.setInput('roleLabel', 'Platform admin');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.profile-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const profileItem = Array.from(
      fixture.nativeElement.querySelectorAll('.profile-menu-item'),
    ).find((item) => (item as HTMLElement).textContent?.trim() === 'Profile') as HTMLButtonElement;

    profileItem.click();
    fixture.detectChanges();

    expect(navigateByUrl).toHaveBeenCalledWith('/profile');
    expect(fixture.nativeElement.querySelector('.profile-dropdown')).toBeNull();
  });
});
