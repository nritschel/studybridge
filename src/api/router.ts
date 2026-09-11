import type { IncomingMessage, ServerResponse } from "node:http";
import type { Application } from "../application.js";
import { AppError } from "../domain/errors.js";
import {
  noteVisibilities,
  priorities,
  requestStatuses,
  type AccountSummary,
  type NoteVisibility,
  type Priority,
  type RequestFilters,
  type RequestStatus,
} from "../domain/types.js";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "./authCookie.js";
import { readJson, requireString, sendError, sendJson } from "./http.js";

export type ApplicationProvider = () => Promise<Application>;

export function createApiHandler(getApplication: ApplicationProvider) {
  return async function handleApi(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", "http://studybridge.local");
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      const application = await getApplication();

      if (method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(request);
        const result = await application.auth.login(
          requireString(body.username, "username"),
          requireString(body.password, "password"),
        );
        setSessionCookie(response, result.token);
        sendJson(response, 200, { account: result.account });
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/logout") {
        application.auth.logout(readSessionToken(request));
        clearSessionCookie(response);
        sendJson(response, 200, { status: "signed_out" });
        return;
      }

      if (method === "GET" && url.pathname === "/api/auth/session") {
        sendJson(response, 200, {
          account: await authenticatedAccount(request, application),
        });
        return;
      }

      const actor = await authenticatedAccount(request, application);

      if (method === "GET" && url.pathname === "/api/requests") {
        sendJson(response, 200, {
          requests: await application.queries.listRequests(
            actor.id,
            parseFilters(url),
          ),
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/requests") {
        const body = await readJson(request);
        const priority = requireString(body.priority, "priority");
        if (!priorities.includes(priority as Priority)) {
          throw new AppError(
            "bad_request",
            "'priority' must be 'low', 'normal', or 'high'.",
          );
        }
        const created = await application.requests.createRequest({
          actorId: actor.id,
          title: requireString(body.title, "title"),
          description: requireString(body.description, "description"),
          priority: priority as Priority,
          tags: optionalStringArray(body.tags, "tags"),
        });
        sendJson(response, 201, { request: created });
        return;
      }

      const detailMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
      if (method === "GET" && detailMatch?.[1] !== undefined) {
        const requestId = decodeURIComponent(detailMatch[1]);
        sendJson(response, 200, {
          request: await application.queries.getRequest(actor.id, requestId),
          canWriteNotes: await application.queries.canViewerWriteNotes(actor.id),
        });
        return;
      }

      const actionMatch = url.pathname.match(
        /^\/api\/requests\/([^/]+)\/(claim|resolve)$/,
      );
      if (method === "POST" && actionMatch?.[1] !== undefined) {
        const requestId = decodeURIComponent(actionMatch[1]);
        const updated = actionMatch[2] === "claim"
          ? await application.requests.claimRequest(actor.id, requestId)
          : await application.requests.resolveRequest(actor.id, requestId);
        sendJson(response, 200, { request: updated });
        return;
      }

      const noteMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/notes$/);
      if (method === "POST" && noteMatch?.[1] !== undefined) {
        const body = await readJson(request);
        const visibility = requireString(body.visibility, "visibility");
        if (!noteVisibilities.includes(visibility as NoteVisibility)) {
          throw new AppError(
            "bad_request",
            "'visibility' must be 'public' or 'staff'.",
          );
        }
        const note = await application.requests.addNote({
          actorId: actor.id,
          requestId: decodeURIComponent(noteMatch[1]),
          body: requireString(body.body, "body"),
          visibility: visibility as NoteVisibility,
        });
        sendJson(response, 201, { note });
        return;
      }

      const anonymizeMatch = url.pathname.match(
        /^\/api\/accounts\/([^/]+)\/anonymize$/,
      );
      if (method === "POST" && anonymizeMatch?.[1] !== undefined) {
        const account = await application.accounts.anonymizeAccount(
          actor.id,
          decodeURIComponent(anonymizeMatch[1]),
        );
        sendJson(response, 200, { account });
        return;
      }

      const closeMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/close$/);
      if (method === "POST" && closeMatch?.[1] !== undefined) {
        const body = await readJson(request);
        // The actor is always the authenticated session. The body's actorId
        // confirms intent but may never select a different actor.
        const actorId = requireString(body.actorId, "actorId");
        if (actorId !== actor.id) {
          throw new AppError(
            "forbidden",
            "'actorId' must match the signed-in account.",
          );
        }
        const account = await application.accounts.closeOwnAccount(
          actor.id,
          decodeURIComponent(closeMatch[1]),
        );
        // A closed account is inactive, so its session is no longer valid.
        application.auth.logout(readSessionToken(request));
        clearSessionCookie(response);
        sendJson(response, 200, { account });
        return;
      }

      sendJson(response, 404, {
        error: "not_found",
        message: "No API route matches this request.",
      });
    } catch (error) {
      sendError(response, error);
    }
  };
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AppError(
      "bad_request",
      `'${field}' must be an array of strings.`,
    );
  }
  return value as string[];
}

async function authenticatedAccount(
  request: IncomingMessage,
  application: Application,
): Promise<AccountSummary> {
  return application.auth.accountForToken(readSessionToken(request));
}

function parseFilters(url: URL): RequestFilters {
  const status = url.searchParams.get("status");
  const tag = url.searchParams.get("tag");
  if (status !== null && !requestStatuses.includes(status as RequestStatus)) {
    throw new AppError("bad_request", "Unknown request status filter.");
  }

  return {
    ...(status === null ? {} : { status: status as RequestStatus }),
    ...(tag === null || tag.length === 0 ? {} : { tag }),
  };
}
