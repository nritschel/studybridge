export const accountRoles = ["student", "mentor", "coordinator"] as const;
export type AccountRole = (typeof accountRoles)[number];

export const requestStatuses = ["open", "claimed", "resolved"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const priorities = ["low", "normal", "high"] as const;
export type Priority = (typeof priorities)[number];

export const noteVisibilities = ["public", "staff"] as const;
export type NoteVisibility = (typeof noteVisibilities)[number];

export interface Account {
  id: string;
  displayName: string;
  email: string;
  role: AccountRole;
  active: boolean;
  createdAt: string;
  anonymizedAt?: string;
}

export interface HelpRequest {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  assigneeId?: string;
  status: RequestStatus;
  priority: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface RequestNote {
  id: string;
  requestId: string;
  authorId: string;
  body: string;
  visibility: NoteVisibility;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action:
    | "request.created"
    | "request.claimed"
    | "request.resolved"
    | "request.note_added"
    | "account.anonymized"
    | "account.closed";
  targetType: "request" | "account";
  targetId: string;
  occurredAt: string;
  details: Record<string, string>;
}

export interface DatabaseState {
  accounts: Account[];
  requests: HelpRequest[];
  notes: RequestNote[];
  auditEvents: AuditEvent[];
}

export interface RequestFilters {
  status?: RequestStatus;
  tag?: string;
}

export interface AccountSummary {
  id: string;
  displayName: string;
  role: AccountRole;
  active: boolean;
}

export interface RequestSummary {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  priority: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  requester: AccountSummary;
  assignee: AccountSummary | null;
  visibleNoteCount: number;
}

export interface NoteView {
  id: string;
  body: string;
  visibility: NoteVisibility;
  createdAt: string;
  author: AccountSummary;
}

export interface RequestDetail extends RequestSummary {
  notes: NoteView[];
}
