import { badRequest, conflict, forbidden } from "../domain/errors.js";
import {
  canAddNote,
  canClaimRequest,
  canCreateRequest,
  canResolveRequest,
} from "../domain/policies.js";
import type {
  AuditEvent,
  HelpRequest,
  NoteVisibility,
  Priority,
  RequestNote,
} from "../domain/types.js";
import type { StudyBridgeRepository } from "../repositories/interfaces.js";
import type { Clock } from "../utils/clock.js";
import type { IdSource } from "../utils/id.js";
import { iso, requireAccount, requireRequest } from "./helpers.js";

export class RequestService {
  constructor(
    private readonly repository: StudyBridgeRepository,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async createRequest(input: {
    actorId: string;
    title: string;
    description: string;
    priority: Priority;
    tags: string[];
  }): Promise<HelpRequest> {
    const actor = await requireAccount(this.repository, input.actorId);
    if (!canCreateRequest(actor)) {
      throw forbidden("Only active students can create support requests.");
    }

    const title = input.title.trim();
    const description = input.description.trim();
    if (title.length === 0) {
      throw badRequest("A request title cannot be empty.");
    }
    if (title.length > 120) {
      throw badRequest("A request title cannot be longer than 120 characters.");
    }
    if (description.length === 0) {
      throw badRequest("A request description cannot be empty.");
    }
    if (description.length > 1200) {
      throw badRequest(
        "A request description cannot be longer than 1200 characters.",
      );
    }

    const tags = normalizedTags(input.tags);
    const occurredAt = iso(this.clock.now());
    const request: HelpRequest = {
      id: this.ids.next("request"),
      title,
      description,
      requesterId: actor.id,
      status: "open",
      priority: input.priority,
      tags,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.repository.saveRequest(request);
    await this.repository.appendAuditEvent(
      this.requestEvent(
        actor.id,
        "request.created",
        request.id,
        occurredAt,
        {},
      ),
    );
    return request;
  }

  async claimRequest(actorId: string, requestId: string): Promise<HelpRequest> {
    const [actor, request] = await Promise.all([
      requireAccount(this.repository, actorId),
      requireRequest(this.repository, requestId),
    ]);

    if (request.status === "resolved") {
      throw conflict("Resolved requests cannot be claimed.");
    }
    if (request.assigneeId === actor.id) {
      return request;
    }
    if (request.assigneeId !== undefined) {
      throw conflict("This request is already assigned to another mentor.");
    }
    if (!canClaimRequest(actor, request)) {
      throw forbidden("Only active mentors and coordinators can claim requests.");
    }

    const occurredAt = iso(this.clock.now());
    const updated: HelpRequest = {
      ...request,
      assigneeId: actor.id,
      status: "claimed",
      updatedAt: occurredAt,
    };

    await this.repository.saveRequest(updated);
    await this.repository.appendAuditEvent(
      this.requestEvent(
        actor.id,
        "request.claimed",
        request.id,
        occurredAt,
        { assigneeId: actor.id },
      ),
    );
    return updated;
  }

  async resolveRequest(
    actorId: string,
    requestId: string,
  ): Promise<HelpRequest> {
    const [actor, request] = await Promise.all([
      requireAccount(this.repository, actorId),
      requireRequest(this.repository, requestId),
    ]);

    if (request.status === "resolved") {
      throw conflict("This request is already resolved.");
    }
    if (!canResolveRequest(actor, request)) {
      throw forbidden(
        "Mentors may resolve requests assigned to them; coordinators may resolve any request.",
      );
    }

    const occurredAt = iso(this.clock.now());
    const updated: HelpRequest = {
      ...request,
      status: "resolved",
      resolvedAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.repository.saveRequest(updated);
    await this.repository.appendAuditEvent(
      this.requestEvent(
        actor.id,
        "request.resolved",
        request.id,
        occurredAt,
        {},
      ),
    );
    return updated;
  }

  async addNote(input: {
    actorId: string;
    requestId: string;
    body: string;
    visibility: NoteVisibility;
  }): Promise<RequestNote> {
    const [actor] = await Promise.all([
      requireAccount(this.repository, input.actorId),
      requireRequest(this.repository, input.requestId),
    ]);
    if (!canAddNote(actor)) {
      throw forbidden("Only active mentors and coordinators can add notes.");
    }

    const body = input.body.trim();
    if (body.length === 0) {
      throw badRequest("A note cannot be empty.");
    }
    // The limit is 500 Unicode code points.
    if ([...body].length > 500) {
      throw badRequest("A note cannot be longer than 500 characters.");
    }

    const occurredAt = iso(this.clock.now());
    const note: RequestNote = {
      id: this.ids.next("note"),
      requestId: input.requestId,
      authorId: actor.id,
      body,
      visibility: input.visibility,
      createdAt: occurredAt,
    };
    await this.repository.appendNote(note);

    await this.repository.appendAuditEvent(
      this.requestEvent(
        actor.id,
        "request.note_added",
        input.requestId,
        occurredAt,
        { noteId: note.id, visibility: note.visibility },
      ),
    );
    return note;
  }

  private requestEvent(
    actorId: string,
    action: AuditEvent["action"],
    targetId: string,
    occurredAt: string,
    details: Record<string, string>,
  ): AuditEvent {
    return {
      id: this.ids.next("event"),
      actorId,
      action,
      targetType: "request",
      targetId,
      occurredAt,
      details,
    };
  }
}

function normalizedTags(values: string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const tag = value.trim();
    if (tag.length === 0) {
      continue;
    }
    if (tag.length > 30) {
      throw badRequest("A request tag cannot be longer than 30 characters.");
    }
    const key = tag.toLocaleLowerCase();
    if (!unique.has(key)) {
      unique.set(key, tag);
    }
  }
  if (unique.size > 5) {
    throw badRequest("A request cannot have more than 5 tags.");
  }
  return [...unique.values()];
}
