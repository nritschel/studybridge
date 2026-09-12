import { forbidden } from "../domain/errors.js";
import { canAnonymizeAccount } from "../domain/policies.js";
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

    if (!canAnonymizeAccount(actor, target)) {
      throw forbidden(
        "You may close your own account; only an active coordinator can close another.",
      );
    }
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
