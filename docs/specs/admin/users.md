# User management (admin)

## Purpose

Admins find accounts, grant teacher or admin access, disable accounts and help people back in,
with a record of who changed what.

## Behavior

- **Search** (`GET /admin/users`): optional name or email text (≤100 characters, case-insensitive),
  at most 50 results sorted by display name, plus the total. Each user shows six safe fields
  (no password hash, no enrollments).
- **Role** (`PATCH /admin/users/:userId/role`): `student`, `teacher` or `admin`. **Status**
  (`PATCH …/status`): `active` or `disabled`. Setting the same value writes nothing and logs nothing.
  Admins cannot change their own role or status (409).
- Changes take effect on the target's next request: a demoted teacher keeps their courses but can
  no longer author; a disabled account gets 401 and its login answers like a wrong password.
  Reactivation restores access.
- **Reset link** (`POST /admin/users/:userId/password-reset`): sends the ordinary reset mail; 409 for
  a disabled account or when the three-mail limit is used up.
- **Recent changes** (`GET /admin/users/changes`): the newest 50 role and status changes with actor,
  target, field, from and to. Kept permanently; a failed log write does not undo the change.
- Students and teachers get 403 without any information about the target.

## Code

- API: `adminUsersRoutes.ts`, `userChangeRepository.ts`, `authRepository.ts`,
  `mongoAuthRepository.ts`, `passwordResetDelivery.ts`.
- App: `pages/admin-page/` (Users section), `services/admin-users.service.ts`.

## Limits

- Two admins demoting or disabling each other at the same moment is not prevented across instances.
