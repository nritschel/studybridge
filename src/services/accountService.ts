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
    if (target.anonymizedAt !== undefined) {
      return target;
    }
    return this.anonymize(actor, target);
  }

  /**
   * Self-service account closure. Closing means anonymizing in place (see
   * docs/adr/0002-retain-anonymized-history.md): the account ID and every
   * linked request, note, and audit event are retained.
   */
  async closeOwnAccount(actorId: string, targetId: string): Promise<Account> {
    const [actor, target] = await Promise.all([
      requireAccount(this.repository, actorId),
      requireAccount(this.repository, targetId),
    ]);

    if (actor.id === target.id && target.anonymizedAt !== undefined) {
      return target;
    }
    if (!canCloseOwnAccount(actor, target.id)) {
      throw forbidden(
        "You can only close your own active account. A coordinator can anonymize other accounts.",
      );
    }
    return this.anonymize(actor, target);
  }

  private async anonymize(actor: Account, target: Account): Promise<Account> {
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
