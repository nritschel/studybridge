import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../src/domain/errors.js";
import { createTestContext } from "./fixtures.js";

describe("QueryService", () => {
  it("shows a student only their own support requests", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("student_steve");

    assert.deepEqual(
      requests.map((request) => request.id).sort(),
      ["request_calculus", "request_planning"],
    );
  });

  it("shows mentors requests from every student", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("mentor_morgan");
    assert.equal(requests.length, 5);
  });

  it("filters by an exact status and tag", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("mentor_morgan", {
      status: "open",
      tag: "Calculus",
    });
    assert.deepEqual(requests.map((request) => request.id), ["request_calculus"]);
  });

  it("matches tag filters regardless of case", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("mentor_morgan", {
      tag: "calculus",
    });
    assert.deepEqual(requests.map((request) => request.id), ["request_calculus"]);
  });

  it("matches a multi-word tag filter regardless of case", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("mentor_morgan", {
      tag: "STUDY SKILLS",
    });
    assert.deepEqual(requests.map((request) => request.id), ["request_planning"]);
  });

  it("keeps the original tag spelling when a filter matches on case", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("mentor_morgan", {
      tag: "tutoring",
    });
    assert.deepEqual(requests.map((request) => request.tags), [
      ["Calculus", "Tutoring"],
    ]);
  });

  it("hides staff note contents from a student", async () => {
    const context = createTestContext();
    const request = await context.queries.getRequest(
      "student_steve",
      "request_planning",
    );

    assert.deepEqual(request.notes.map((note) => note.id), ["note_public"]);
    assert.equal(request.visibleNoteCount, 1);
  });

  it("shows public and staff notes to a mentor", async () => {
    const context = createTestContext();
    const request = await context.queries.getRequest(
      "mentor_morgan",
      "request_planning",
    );
    assert.deepEqual(
      request.notes.map((note) => note.id),
      ["note_public", "note_staff"],
    );
    assert.equal(request.visibleNoteCount, 2);
  });

  it("forbids one student from opening another student's request", async () => {
    const context = createTestContext();
    await assert.rejects(
      () => context.queries.getRequest("student_steve", "request_writing"),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "forbidden");
        return true;
      },
    );
  });

  it("renders an anonymized account with the stable former-member label", async () => {
    const context = createTestContext();
    await context.accounts.anonymizeAccount("coordinator_priya", "student_steve");
    const requests = await context.queries.listRequests("mentor_morgan");
    const calculus = requests.find((request) => request.id === "request_calculus");
    assert.equal(calculus?.requester.displayName, "Former member");
  });
});
