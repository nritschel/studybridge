import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../src/domain/errors.js";
import { NOW, createTestContext } from "./fixtures.js";

describe("RequestService", () => {
  it("lets an active student create an open support request", async () => {
    const context = createTestContext();

    const result = await context.requests.createRequest({
      actorId: "student_steve",
      title: "  Prepare for a chemistry quiz  ",
      description: "  I am unsure how to balance redox reactions.  ",
      priority: "normal",
      tags: [" Chemistry ", "Quiz prep", "chemistry", ""],
    });

    assert.equal(result.id, "request_suite_1");
    assert.equal(result.title, "Prepare for a chemistry quiz");
    assert.equal(result.description, "I am unsure how to balance redox reactions.");
    assert.equal(result.requesterId, "student_steve");
    assert.equal(result.status, "open");
    assert.equal(result.assigneeId, undefined);
    assert.equal(result.priority, "normal");
    assert.deepEqual(result.tags, ["Chemistry", "Quiz prep"]);
    assert.equal(result.createdAt, NOW);
    assert.equal(result.updatedAt, NOW);
    assert.deepEqual(await context.repository.getRequest(result.id), result);

    const events = await context.repository.listAuditEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "request.created");
    assert.equal(events[0]?.targetId, result.id);
    assert.deepEqual(events[0]?.details, {});
    assert.equal(JSON.stringify(events).includes("chemistry"), false);
  });

  it("rejects support requests created by staff without changing state", async () => {
    const context = createTestContext();
    const before = await context.repository.listRequests();

    await assertAppError(
      () => context.requests.createRequest({
        actorId: "mentor_morgan",
        title: "Staff-created request",
        description: "This should not be persisted.",
        priority: "low",
        tags: [],
      }),
      "forbidden",
    );

    assert.deepEqual(await context.repository.listRequests(), before);
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("validates student-entered request content before persisting", async () => {
    const context = createTestContext();

    await assertAppError(
      () => context.requests.createRequest({
        actorId: "student_steve",
        title: "   ",
        description: "A real description",
        priority: "high",
        tags: [],
      }),
      "bad_request",
    );
    await assertAppError(
      () => context.requests.createRequest({
        actorId: "student_steve",
        title: "A real title",
        description: "A real description",
        priority: "high",
        tags: ["1", "2", "3", "4", "5", "6"],
      }),
      "bad_request",
    );

    assert.deepEqual(await context.repository.listAuditEvents(), []);
    assert.equal((await context.repository.listRequests()).length, 5);
  });

  it("lets an active mentor claim an open support request", async () => {
    const context = createTestContext();

    const result = await context.requests.claimRequest(
      "mentor_morgan",
      "request_calculus",
    );

    assert.equal(result.status, "claimed");
    assert.equal(result.assigneeId, "mentor_morgan");
    assert.equal(result.updatedAt, NOW);
    assert.deepEqual(await context.repository.getRequest("request_calculus"), result);
    const events = await context.repository.listAuditEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "request.claimed");
    assert.deepEqual(events[0]?.details, { assigneeId: "mentor_morgan" });
  });

  it("rejects a claim by a student without changing state", async () => {
    const context = createTestContext();

    await assertAppError(
      () => context.requests.claimRequest("student_steve", "request_calculus"),
      "forbidden",
    );

    assert.equal(
      (await context.repository.getRequest("request_calculus"))?.status,
      "open",
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("reports a conflict when another mentor already has the request", async () => {
    const context = createTestContext();

    await assertAppError(
      () => context.requests.claimRequest("coordinator_priya", "request_planning"),
      "conflict",
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("treats a repeated claim by the same mentor as a no-op", async () => {
    const context = createTestContext();

    const before = await context.repository.getRequest("request_planning");
    const result = await context.requests.claimRequest(
      "mentor_morgan",
      "request_planning",
    );

    assert.deepEqual(result, before);
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("does not allow a resolved request to be claimed", async () => {
    const context = createTestContext();
    await assertAppError(
      () => context.requests.claimRequest("mentor_morgan", "request_resolved"),
      "conflict",
    );
  });

  it("rejects a repeated claim from a mentor who became inactive", async () => {
    const context = createTestContext();
    const before = await context.repository.getRequest("request_inactive_claim");

    await assertAppError(
      () => context.requests.claimRequest(
        "mentor_inactive",
        "request_inactive_claim",
      ),
      "forbidden",
    );

    // The request stays assigned; deactivation does not release it.
    assert.deepEqual(
      await context.repository.getRequest("request_inactive_claim"),
      before,
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("lets a mentor resolve a request assigned to them", async () => {
    const context = createTestContext();

    const result = await context.requests.resolveRequest(
      "mentor_morgan",
      "request_planning",
    );

    assert.equal(result.status, "resolved");
    assert.equal(result.resolvedAt, NOW);
    const events = await context.repository.listAuditEvents();
    assert.equal(events[0]?.action, "request.resolved");
    assert.deepEqual(events[0]?.details, {});
  });

  it("rejects a mentor resolving somebody else's request", async () => {
    const context = createTestContext();
    await assertAppError(
      () => context.requests.resolveRequest("mentor_morgan", "request_calculus"),
      "forbidden",
    );
  });

  it("lets a coordinator resolve any active request", async () => {
    const context = createTestContext();
    const result = await context.requests.resolveRequest(
      "coordinator_priya",
      "request_calculus",
    );
    assert.equal(result.status, "resolved");
  });

  it("trims a note and records a non-sensitive audit event", async () => {
    const context = createTestContext();

    const note = await context.requests.addNote({
      actorId: "mentor_morgan",
      requestId: "request_calculus",
      body: "  Let's sketch the diagram first.  ",
      visibility: "public",
    });

    assert.equal(note.body, "Let's sketch the diagram first.");
    assert.equal(note.createdAt, NOW);
    const events = await context.repository.listAuditEvents();
    assert.equal(events[0]?.action, "request.note_added");
    assert.deepEqual(events[0]?.details, {
      noteId: note.id,
      visibility: "public",
    });
    assert.equal(JSON.stringify(events).includes("sketch"), false);
  });

  it("measures the note limit in Unicode code points", async () => {
    const context = createTestContext();

    // 300 emoji are 600 UTF-16 code units but only 300 code points.
    const note = await context.requests.addNote({
      actorId: "mentor_morgan",
      requestId: "request_calculus",
      body: "\u{1F642}".repeat(300),
      visibility: "public",
    });
    assert.equal([...note.body].length, 300);

    await assertAppError(
      () =>
        context.requests.addNote({
          actorId: "mentor_morgan",
          requestId: "request_calculus",
          body: "\u{1F642}".repeat(501),
          visibility: "public",
        }),
      "bad_request",
    );
    assert.equal((await context.repository.listAuditEvents()).length, 1);
  });

  it("rejects empty notes and student-authored notes", async () => {
    const first = createTestContext();
    await assertAppError(
      () =>
        first.requests.addNote({
          actorId: "mentor_morgan",
          requestId: "request_calculus",
          body: "   ",
          visibility: "public",
        }),
      "bad_request",
    );

    const second = createTestContext();
    await assertAppError(
      () =>
        second.requests.addNote({
          actorId: "student_steve",
          requestId: "request_calculus",
          body: "Can I write a note?",
          visibility: "public",
        }),
      "forbidden",
    );
  });
});

async function assertAppError(
  action: () => Promise<unknown>,
  code: AppError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  });
}
