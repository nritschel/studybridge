import { forbidden } from "../domain/errors.js";
import { canAnonymizeAccount, canCloseOwnAccount } from "../domain/policies.js";
import type { Account, AuditEvent } from "../domain/types.js";
import type { StudyBridgeRepository } from "../repositories/interfaces.js";
import type { Clock } from "../utils/clock.js";
import type { IdSource } from "../utils/id.js";
import { iso, requireAccount } from "./helpers.js";

type AccountAuditAction = Extract<
  AuditEvent["action"],
  "account.anonymized" | "account.closed"
>;

export class AccountService {
  constructor(
    private readonly repository: StudyBridgeRepository,
    private readonly clock: Clock,
    private readonly ids: IdSource,
  ) {}

  async anonymizeAccount(
    actorId: string,
    targetId: string,
  ): Promise<Account> {
    const [actor, target] = await Promise.all([
      requireAccount(this.repository, actorId),
      requireAccount(this.repository, targetId),
    ]);

    if (!canAnonymizeAccount(actor)) {
      throw forbidden("Only an active coordinator can anonymize an account.");
    }
    if (target.anonymizedAt !== undefined) {
      return target;
    }

    return this.anonymize(actor, target, "account.anonymized");
  }

  /**
   * Self-service closure. Closing is the same anonymization a coordinator
   * performs, so history, notes, and audit events keep their stable account ID.
   */
  async closeOwnAccount(actorId: string, targetId: string): Promise<Account> {
    const actor = await requireAccount(this.repository, actorId);

    // Compare IDs before loading anything else so a caller cannot learn which
    // other account IDs exist from a not-found response.
    if (targetId !== actor.id) {
      throw forbidden("You can only close your own account.");
    }
    if (actor.anonymizedAt !== undefined) {
      return actor;
    }
    if (!canCloseOwnAccount(actor)) {
      throw forbidden("Only an active student can close their own account.");
    }

    return this.anonymize(actor, actor, "account.closed");
  }

  private async anonymize(
    actor: Account,
    target: Account,
    action: AccountAuditAction,
  ): Promise<Account> {
    const occurredAt = iso(this.clock.now());
    const anonymized: Account = {
      ...target,
      displayName: "Former member",
      email: `closed+${target.id}@invalid.studybridge`,
      active: false,
      anonymizedAt: occurredAt,
    };
    await this.repository.saveAccount(anonymized);

    const event: AuditEvent = {
      id: this.ids.next("event"),
      actorId: actor.id,
      action,
      targetType: "account",
      targetId: target.id,
      occurredAt,
      details: {},
    };
    await this.repository.appendAuditEvent(event);
    return anonymized;
  }
}
