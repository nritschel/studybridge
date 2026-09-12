import { forbidden } from "../domain/errors.js";
import { canAnonymizeAccount, canCloseOwnAccount } from "../domain/policies.js";
import type { Account, AuditEvent } from "../domain/types.js";
import type { StudyBridgeRepository } from "../repositories/interfaces.js";
import type { Clock } from "../utils/clock.js";
import type { IdSource } from "../utils/id.js";
import { iso, requireAccount } from "./helpers.js";

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
    return this.anonymize(actor, target);
  }

  /**
   * Self-service closure for a student. Closing an account is the same
   * anonymization use case, so it keeps the account ID and leaves requests,
   * notes, and audit events in place. The acting account comes from the
   * session; the target ID is only checked against it, never loaded, so this
   * endpoint cannot be used to probe for other accounts.
   */
  async closeOwnAccount(actorId: string, targetId: string): Promise<Account> {
    const actor = await requireAccount(this.repository, actorId);

    if (!canCloseOwnAccount(actor, targetId)) {
      throw forbidden(
        "You can only close your own student account. Ask a coordinator to close a staff account.",
      );
    }
    return this.anonymize(actor, actor);
  }

  private async anonymize(actor: Account, target: Account): Promise<Account> {
    if (target.anonymizedAt !== undefined) {
      return target;
    }

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
      action: "account.anonymized",
      targetType: "account",
      targetId: target.id,
      occurredAt,
      details: {},
    };
    await this.repository.appendAuditEvent(event);
    return anonymized;
  }
}
