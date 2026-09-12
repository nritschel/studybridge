import type { Account, HelpRequest, RequestNote } from "./types.js";

export function isStaff(account: Account): boolean {
  return account.role === "mentor" || account.role === "coordinator";
}

export function canViewRequest(
  viewer: Account,
  request: HelpRequest,
): boolean {
  return viewer.active && (isStaff(viewer) || request.requesterId === viewer.id);
}

export function canViewNote(viewer: Account, note: RequestNote): boolean {
  return viewer.active && (note.visibility === "public" || isStaff(viewer));
}

export function canCreateRequest(actor: Account): boolean {
  return actor.active && actor.role === "student";
}

export function canClaimRequest(
  actor: Account,
  request: HelpRequest,
): boolean {
  return (
    actor.active &&
    isStaff(actor) &&
    request.status !== "resolved" &&
    (request.assigneeId === undefined || request.assigneeId === actor.id)
  );
}

export function canResolveRequest(
  actor: Account,
  request: HelpRequest,
): boolean {
  if (!actor.active || request.status === "resolved") {
    return false;
  }

  return actor.role === "coordinator" ||
    (actor.role === "mentor" && request.assigneeId === actor.id);
}

export function canAddNote(actor: Account): boolean {
  return actor.active && isStaff(actor);
}

export function canAnonymizeAccount(actor: Account): boolean {
  return actor.active && actor.role === "coordinator";
}

/**
 * Self-service closure. The service checks that the target is the actor's own
 * account; this policy decides which roles may use the flow at all.
 */
export function canCloseOwnAccount(actor: Account): boolean {
  return actor.active && actor.role === "student";
}
