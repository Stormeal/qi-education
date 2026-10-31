# US-P021 retained domains brief

Read first: requirements for independent adapter work in organizationRepository.ts,
feedbackRepository.ts (including freeze), userChangeRepository.ts and their tests.
Spec: docs/stories/US-P021-gdpr-data-rights.md disposition table. Main only,
isolated synthetic tests, no shared mutation, no push, no commits, no subagents.
Other workers own all other production files, preserve their edits.

OrganizationRepository: collectForExport(userId: string, email?: string) returns
only caller's membership, owned org references (exclude other members' PII),
their requests and invitations matching their email, with tokens/hashes stripped.
Implement erasureBlockers(userId: string): Promise<{id:string;name:string}[]>
for owner membership with other members or active billing (inspect current data
model; conservatively block owner where transfer is required). Implement
removeForUser(userId:string, email?:string): Promise<void>, under org lock,
refuse blockers before mutations, remove membership and caller-related personal
request/invite data (including invited email), ensure old invitation cannot restore
membership. Do not change unrelated members/data. Handle retries idempotently.
Identify any concurrency limits to root before assuming unsafe workarounds.

FeedbackRepository: collectForExport(userId:string), anonymizeForUser(userId:string)
strip submitter name/email, retaining text per approved contract. Memory, Mongo,
Sheets adapters all covered; respect read-only wrapper. Never call shared Sheets.
UserChangeRepository: anonymizeForUser(userId:string) removes target identifiers
and personal actor displayName where same user (opaque id may remain), keeps action
and timestamps; recordErasure(userId:string, at:string):Promise<void> creates exactly
one audit marker with deterministic ID, no personal data, idempotent across hosts.
Use current user-change field model or extend it minimally for erasure event.

Follow TDD for both memory and real Mongo adapter query boundaries, two users,
repeat erasure, tokens/secret exclusion; focused tests only while other tests run.
Update relevant collection fakes but no unrelated API/app files. No docs except
report: docs/handoffs/US-P021-retained-domains-report.md (methods, RED/GREEN
commands/results, files, limitations, decisions, integration concerns).
Return concise status, test summary, report path.
