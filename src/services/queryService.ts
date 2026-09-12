import { forbidden } from "../domain/errors.js";
import { canViewNote, canViewRequest, isStaff } from "../domain/policies.js";
import type {
  Account,
  AccountSummary,
  HelpRequest,
  NoteView,
  RequestDetail,
  RequestFilters,
  RequestSummary,
} from "../domain/types.js";
import type { StudyBridgeRepository } from "../repositories/interfaces.js";
import { requireAccount, requireRequest } from "./helpers.js";

export class QueryService {
  constructor(private readonly repository: StudyBridgeRepository) {}

  async listRequests(
    viewerId: string,
    filters: RequestFilters = {},
  ): Promise<RequestSummary[]> {
    const [viewer, requests, accounts] = await Promise.all([
      requireAccount(this.repository, viewerId),
      this.repository.listRequests(),
      this.repository.listAccounts(),
    ]);
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    // Tags keep their original spelling for display, so the filter compares
    // folded copies instead.
    const tagFilter = filters.tag?.trim().toLocaleLowerCase();

    const visible = requests
      .filter((request) => canViewRequest(viewer, request))
      .filter((request) =>
        filters.status === undefined ? true : request.status === filters.status,
      )
      .filter((request) =>
        tagFilter === undefined || tagFilter.length === 0
          ? true
          : request.tags.some((tag) => tag.toLocaleLowerCase() === tagFilter),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return Promise.all(
      visible.map(async (request) => {
        const notes = await this.repository.listNotesForRequest(request.id);
        // A summary must not reveal that staff notes exist.
        const visibleNotes = notes.filter((note) => canViewNote(viewer, note));
        return this.toSummary(request, accountsById, visibleNotes.length);
      }),
    );
  }

  async getRequest(
    viewerId: string,
    requestId: string,
  ): Promise<RequestDetail> {
    const [viewer, request, accounts, notes] = await Promise.all([
      requireAccount(this.repository, viewerId),
      requireRequest(this.repository, requestId),
      this.repository.listAccounts(),
      this.repository.listNotesForRequest(requestId),
    ]);

    if (!canViewRequest(viewer, request)) {
      throw forbidden("You cannot view this request.");
    }

    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const visibleNotes = notes.filter((note) => canViewNote(viewer, note));
    const noteViews: NoteView[] = visibleNotes.map((note) => ({
      id: note.id,
      body: note.body,
      visibility: note.visibility,
      createdAt: note.createdAt,
      author: accountSummary(requireMapped(accountsById, note.authorId)),
    }));

    return {
      ...this.toSummary(request, accountsById, visibleNotes.length),
      notes: noteViews,
    };
  }

  async canViewerWriteNotes(viewerId: string): Promise<boolean> {
    const viewer = await requireAccount(this.repository, viewerId);
    return isStaff(viewer) && viewer.active;
  }

  private toSummary(
    request: HelpRequest,
    accounts: Map<string, Account>,
    visibleNoteCount: number,
  ): RequestSummary {
    return {
      id: request.id,
      title: request.title,
      description: request.description,
      status: request.status,
      priority: request.priority,
      tags: [...request.tags],
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      requester: accountSummary(requireMapped(accounts, request.requesterId)),
      assignee:
        request.assigneeId === undefined
          ? null
          : accountSummary(requireMapped(accounts, request.assigneeId)),
      visibleNoteCount,
    };
  }
}

function accountSummary(account: Account): AccountSummary {
  return {
    id: account.id,
    displayName: account.anonymizedAt === undefined
      ? account.displayName
      : "Former member",
    role: account.role,
    active: account.active,
  };
}

function requireMapped(accounts: Map<string, Account>, id: string): Account {
  const account = accounts.get(id);
  if (account === undefined) {
    throw new Error(`Data integrity error: account '${id}' is missing.`);
  }
  return account;
}
