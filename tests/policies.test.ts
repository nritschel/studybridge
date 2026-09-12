import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAddNote,
  canAnonymizeAccount,
  canClaimRequest,
  canCreateRequest,
  canResolveRequest,
  canViewNote,
  canViewRequest,
  isStaff,
} from "../src/domain/policies.js";
import { baseState } from "./fixtures.js";

describe("authorization policies", () => {
  const state = baseState();
  const student = required(state.accounts, "student_steve");
  const otherStudent = required(state.accounts, "student_lee");
  const mentor = required(state.accounts, "mentor_morgan");
  const inactiveMentor = required(state.accounts, "mentor_inactive");
  const coordinator = required(state.accounts, "coordinator_priya");
  const openRequest = required(state.requests, "request_calculus");
  const claimedRequest = required(state.requests, "request_planning");
  const publicNote = required(state.notes, "note_public");
  const staffNote = required(state.notes, "note_staff");

  it("recognizes active role capabilities", () => {
    assert.equal(isStaff(student), false);
    assert.equal(isStaff(mentor), true);
    assert.equal(isStaff(coordinator), true);
    assert.equal(canAddNote(student), false);
    assert.equal(canCreateRequest(student), true);
    assert.equal(canCreateRequest(mentor), false);
    assert.equal(canCreateRequest(coordinator), false);
    assert.equal(canAddNote(mentor), true);
    assert.equal(canAnonymizeAccount(mentor, student), false);
    assert.equal(canAnonymizeAccount(coordinator, student), true);
  });

  it("lets anyone close their own account but not somebody else's", () => {
    assert.equal(canAnonymizeAccount(student, student), true);
    assert.equal(canAnonymizeAccount(student, otherStudent), false);
    assert.equal(canAnonymizeAccount(mentor, mentor), true);
    assert.equal(canAnonymizeAccount(coordinator, otherStudent), true);
  });

  it("lets students view only their own requests", () => {
    assert.equal(canViewRequest(student, openRequest), true);
    assert.equal(canViewRequest(otherStudent, openRequest), false);
    assert.equal(canViewRequest(mentor, openRequest), true);
  });

  it("never grants capabilities to an inactive account", () => {
    assert.equal(canViewRequest(inactiveMentor, openRequest), false);
    assert.equal(canClaimRequest(inactiveMentor, openRequest), false);
    assert.equal(canCreateRequest({ ...student, active: false }), false);
    assert.equal(canAddNote(inactiveMentor), false);
    assert.equal(canAnonymizeAccount(inactiveMentor, inactiveMentor), false);
  });

  it("shows staff notes only to staff", () => {
    assert.equal(canViewNote(student, publicNote), true);
    assert.equal(canViewNote(student, staffNote), false);
    assert.equal(canViewNote(mentor, publicNote), true);
    assert.equal(canViewNote(mentor, staffNote), true);
  });

  it("allows a mentor to resolve only their own claimed request", () => {
    assert.equal(canResolveRequest(mentor, claimedRequest), true);
    assert.equal(canResolveRequest(mentor, openRequest), false);
    assert.equal(canResolveRequest(coordinator, openRequest), true);
  });
});

function required<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((candidate) => candidate.id === id);
  assert.ok(item);
  return item;
}
