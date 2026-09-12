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

  it("filters by status and tag together", async () => {
    const context = createTestContext();
    const requests = await context.queries.listRequests("mentor_morgan", {
      status: "open",
      tag: "Calculus",
    });
    assert.deepEqual(requests.map((request) => request.id), ["request_calculus"]);
  });

  it("matches the tag filter without regard to case", async () => {
    const context = createTestContext();

    for (const tag of ["calculus", "CALCULUS", "cAlCuLuS"]) {
      const requests = await context.queries.listRequests("mentor_morgan", { tag });
      assert.deepEqual(
        requests.map((request) => request.id),
        ["request_calculus"],
        `tag filter '${tag}' should match the 'Calculus' tag`,
      );
      // Display keeps the stored spelling; only matching ignores case.
      assert.deepEqual(requests[0]?.tags, ["Calculus", "Tutoring"]);
    }

    const planning = await context.queries.listRequests("mentor_morgan", {
      tag: "planning",
    });
    assert.deepEqual(
      planning.map((request) => request.id).sort(),
      ["request_inactive_claim", "request_planning"],
    );

    const none = await context.queries.listRequests("mentor_morgan", {
      tag: "geometry",
    });
    assert.deepEqual(none, []);
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

  it("counts only notes the viewer may see in list summaries", async () => {
    const context = createTestContext();

    // request_planning has one public note and one staff note.
    const studentList = await context.queries.listRequests("student_steve");
    const planningForStudent = studentList.find(
      (request) => request.id === "request_planning",
    );
    assert.equal(planningForStudent?.visibleNoteCount, 1);

    const studentDetail = await context.queries.getRequest(
      "student_steve",
      "request_planning",
    );
    assert.equal(planningForStudent?.visibleNoteCount, studentDetail.notes.length);

    const mentorList = await context.queries.listRequests("mentor_morgan");
    const planningForMentor = mentorList.find(
      (request) => request.id === "request_planning",
    );
    assert.equal(planningForMentor?.visibleNoteCount, 2);

    // A request whose only note is staff-only must look note-free to the student.
    await context.requests.addNote({
      actorId: "coordinator_priya",
      requestId: "request_calculus",
      body: "Staff-only handoff plan.",
      visibility: "staff",
    });
    const studentAfter = await context.queries.listRequests("student_steve");
    assert.equal(
      studentAfter.find((request) => request.id === "request_calculus")
        ?.visibleNoteCount,
      0,
    );
    const mentorAfter = await context.queries.listRequests("mentor_morgan");
    assert.equal(
      mentorAfter.find((request) => request.id === "request_calculus")
        ?.visibleNoteCount,
      1,
    );
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
