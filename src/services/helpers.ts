import { notFound } from "../domain/errors.js";
import type { Account, HelpRequest } from "../domain/types.js";
import type { StudyBridgeRepository } from "../repositories/interfaces.js";

export async function requireAccount(
  repository: StudyBridgeRepository,
  id: string,
): Promise<Account> {
  const account = await repository.getAccount(id);
  if (account === undefined) {
    throw notFound("Account", id);
  }
  return account;
}

export async function requireRequest(
  repository: StudyBridgeRepository,
  id: string,
): Promise<HelpRequest> {
  const request = await repository.getRequest(id);
  if (request === undefined) {
    throw notFound("Request", id);
  }
  return request;
}

export function iso(date: Date): string {
  return date.toISOString();
}

/**
 * Comparison key for a tag. Tags keep their original spelling for display, but
 * deduplication and filtering must not depend on capitalization.
 */
export function tagKey(tag: string): string {
  return tag.trim().toLocaleLowerCase();
}
