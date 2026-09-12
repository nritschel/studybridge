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

// Claiming is a staff capability. Whether a particular request is still
// claimable is request state, which the service reports as a conflict.
export function canClaimRequest(actor: Account): boolean {
  return actor.active && isStaff(actor);
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

// Self-closure is limited to students. Staff accounts are closed by a
// coordinator, so a coordinator cannot lock the program out by closing the
// last account able to anonymize anyone.
export function canCloseOwnAccount(actor: Account, targetId: string): boolean {
  return actor.active && actor.role === "student" && actor.id === targetId;
}
