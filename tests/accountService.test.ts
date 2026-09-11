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

  it("lets a student close their own account while retaining linked records", async () => {
    const context = createTestContext();

    const result = await context.accounts.closeOwnAccount("student_steve", "student_steve");

    assert.equal(result.id, "student_steve");
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

    const events = await context.repository.listAuditEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "account.anonymized");
    assert.equal(events[0]?.actorId, "student_steve");
    assert.equal(events[0]?.targetId, "student_steve");
    assert.deepEqual(events[0]?.details, {});
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("Steve Student"), false);
    assert.equal(serialized.includes("steve@example.test"), false);
  });

  it("does not let a student close somebody else's account", async () => {
    const context = createTestContext();

    await assert.rejects(
      () => context.accounts.closeOwnAccount("student_steve", "student_lee"),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "forbidden");
        return true;
      },
    );

    assert.equal(
      (await context.repository.getAccount("student_lee"))?.anonymizedAt,
      undefined,
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("does not let an inactive account close itself", async () => {
    const context = createTestContext();

    await assert.rejects(
      () => context.accounts.closeOwnAccount("mentor_inactive", "mentor_inactive"),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "forbidden");
        return true;
      },
    );
    assert.deepEqual(await context.repository.listAuditEvents(), []);
  });

  it("treats a repeated self-service close as an idempotent no-op", async () => {
    const context = createTestContext();
    const first = await context.accounts.closeOwnAccount("student_steve", "student_steve");
    const second = await context.accounts.closeOwnAccount("student_steve", "student_steve");

    assert.deepEqual(second, first);
    assert.equal((await context.repository.listAuditEvents()).length, 1);
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
});
