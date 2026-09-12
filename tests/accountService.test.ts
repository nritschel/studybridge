import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../src/domain/errors.js";
import { NOW, createTestContext } from "./fixtures.js";

describe("AccountService", () => {
  it("anonymizes a student without deleting linked records", async () => {
    const context = createTestContext();

    const result = await context.accounts.anonymizeAccount(
      "coordinator_priya",
      "student_steve",
    );

    assert.equal(result.displayName, "Former member");
    assert.equal(result.email, "closed+student_steve@invalid.studybridge");
    assert.equal(result.active, false);
    assert.equal(result.anonymizedAt, NOW);

    const state = context.repository.snapshot();
    assert.equal(state.accounts.some((account) => account.id === "student_steve"), true);
    assert.equal(
      state.requests.filter((request) => request.requesterId === "student_steve").length,
      2,
    );
  });

  it("creates an audit event without copied personal information", async () => {
    const context = createTestContext();
    await context.accounts.anonymizeAccount("coordinator_priya", "student_steve");

    const events = await context.repository.listAuditEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "account.anonymized");
    assert.equal(events[0]?.targetId, "student_steve");
    assert.deepEqual(events[0]?.details, {});
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("Steve Student"), false);
    assert.equal(serialized.includes("steve@example.test"), false);
  });

  it("does not let a mentor anonymize an account", async () => {
    const context = createTestContext();

    await assert.rejects(
      () => context.accounts.anonymizeAccount("mentor_morgan", "student_steve"),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "forbidden");
        return true;
      },
    );

    assert.equal(
      (await context.repository.getAccount("student_steve"))?.displayName,
      "Steve Student",
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("treats repeated anonymization as an idempotent no-op", async () => {
    const context = createTestContext();
    const first = await context.accounts.anonymizeAccount(
      "coordinator_priya",
      "student_steve",
    );
    const second = await context.accounts.anonymizeAccount(
      "coordinator_priya",
      "student_steve",
    );

    assert.deepEqual(second, first);
    assert.equal((await context.repository.listAuditEvents()).length, 1);
  });

  it("lets a student close their own account and keeps their history", async () => {
    const context = createTestContext();

    const closed = await context.accounts.closeOwnAccount(
      "student_steve",
      "student_steve",
    );

    assert.equal(closed.id, "student_steve");
    assert.equal(closed.displayName, "Former member");
    assert.equal(closed.email, "closed+student_steve@invalid.studybridge");
    assert.equal(closed.active, false);
    assert.equal(closed.anonymizedAt, NOW);
    assert.equal(closed.role, "student");

    const state = context.repository.snapshot();
    assert.deepEqual(await context.repository.getAccount("student_steve"), closed);
    assert.equal(
      state.requests.filter((request) => request.requesterId === "student_steve").length,
      2,
    );
    assert.equal(state.notes.length, 2);

    const events = await context.repository.listAuditEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "account.closed");
    assert.equal(events[0]?.actorId, "student_steve");
    assert.equal(events[0]?.targetType, "account");
    assert.equal(events[0]?.targetId, "student_steve");
    assert.equal(events[0]?.occurredAt, NOW);
    assert.deepEqual(events[0]?.details, {});
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("Steve Student"), false);
    assert.equal(serialized.includes("steve@example.test"), false);
  });

  it("does not let a student close any account but their own", async () => {
    const context = createTestContext();

    for (const targetId of ["student_lee", "coordinator_priya", "no_such_account"]) {
      await assert.rejects(
        () => context.accounts.closeOwnAccount("student_steve", targetId),
        (error: unknown) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, "forbidden", `target ${targetId}`);
          return true;
        },
      );
    }

    assert.equal(
      (await context.repository.getAccount("student_lee"))?.displayName,
      "Lee Learner",
    );
    assert.equal(
      (await context.repository.getAccount("student_steve"))?.active,
      true,
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("does not offer self-service closure to staff or inactive accounts", async () => {
    const context = createTestContext();

    for (const actorId of ["mentor_morgan", "coordinator_priya", "mentor_inactive"]) {
      await assert.rejects(
        () => context.accounts.closeOwnAccount(actorId, actorId),
        (error: unknown) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, "forbidden", `actor ${actorId}`);
          return true;
        },
      );
      assert.equal(
        (await context.repository.getAccount(actorId))?.anonymizedAt,
        undefined,
      );
    }
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("treats repeated self-service closure as an idempotent no-op", async () => {
    const context = createTestContext();
    const first = await context.accounts.closeOwnAccount(
      "student_steve",
      "student_steve",
    );
    const second = await context.accounts.closeOwnAccount(
      "student_steve",
      "student_steve",
    );

    assert.deepEqual(second, first);
    assert.equal((await context.repository.listAuditEvents()).length, 1);
  });
});
