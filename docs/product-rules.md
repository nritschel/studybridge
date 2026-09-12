# Product rules

StudyBridge coordinates peer tutoring and academic-support requests at a
fictional college. A request may concern course concepts, study habits, degree
planning, or finding the right campus office. The rules below are user promises,
including the ones that are inconvenient to implement.

## Roles

- A **student** can create requests, view their own requests, and see public
  notes on those requests.
- A **mentor** can view all requests, claim open requests, resolve requests
  assigned to them, and add public or staff notes.
- A **coordinator** has mentor abilities, can resolve any active request, and
  can anonymize an account.

Role checks happen on the server using the authenticated session. The demo has
one generic login per role: `student`, `mentor`, and `coordinator`, each using
the username as its password. API requests must not choose their own actor or
viewer ID.

## Account closure and retention

Closing an account means anonymizing it, never deleting it. Replace the display
name and email with non-identifying placeholders, set the account inactive, and
record the time of anonymization. Keep the same account ID.

Support requests, notes, and audit events retain that ID so aggregate program
reports and the history of decisions remain internally consistent. The UI should display
"Former member" for an anonymized author. Do not cascade-delete or reassign
their records, and do not put the former name or email into the audit details.

Anonymization is idempotent: repeating it returns the already anonymized
account without creating another audit event. Only a coordinator may anonymize a
different account.

A student may close their own account through `POST /api/accounts/:id/close`.
The acting account comes from the session, and the path ID must match it;
closing any other account is forbidden, whether or not that ID exists. Staff
accounts are closed by a coordinator instead, so closing the last coordinator
cannot leave the program without one. Self-service
closure is the same anonymization use case and records the same audit event,
with the closing account as both actor and target. Closure ends the session, and
a closed account is inactive, so it cannot close itself a second time.

## Requests

Requests move through `open -> claimed -> resolved`.

- Only an active student may create a request. New requests start open and
  unassigned, with the signed-in student as requester.
- A title and description are required. Titles may contain at most 120
  characters, descriptions at most 1,200 characters, and requests at most five
  distinct tags of 30 characters each.
- A mentor may claim an open request. An inactive account may not claim
  anything, including a request already assigned to it.
- Claiming a request already assigned to the same mentor is a successful
  no-op. It should not create a second audit event.
- Claiming a request assigned to somebody else is a conflict.
- A mentor may resolve a request assigned to them; a coordinator may resolve any
  open or claimed request.
- Resolved requests cannot be claimed or resolved again.
- A request assigned to an account that later becomes inactive stays assigned.

Tag matching in filters is case-insensitive. Tags keep their original spelling
for display.

## Notes and privacy

Public notes can be seen by staff and by the student who owns the request.
Staff notes can be seen only by mentors and coordinators. Students must not learn
the content or even the count of staff notes. That applies to detail responses,
list summaries, logs, errors, and client state.

Only mentors and coordinators can add notes. Note bodies are trimmed, must not be
empty, and may contain at most 500 Unicode code points. A successful note write
also produces an audit event, but the event records only the note ID and
visibility—not the note body.

## Audit events

Every state-changing use case creates an audit event unless the documented
result is an idempotent no-op. Events capture the actor ID, action, target ID,
time, and small non-sensitive details. They do not copy note bodies, request
descriptions, names, or email addresses.

Audit events are append-only. Product code never updates or deletes them.

Support notes are coordination aids, not academic records. Do not add grades,
diagnoses, disability documentation, conduct reports, or other sensitive student
records to the app, even as staff notes.
