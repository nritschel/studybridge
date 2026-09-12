import {
  addNote,
  ApiError,
  claimRequest,
  createRequest,
  currentSession,
  getRequest,
  listRequests,
  login,
  logout,
  resolveRequest,
} from "./api.js";
import { button, byId, clear, formatDate, text } from "./dom.js";
import type {
  AccountSummary,
  NoteVisibility,
  Priority,
  RequestDetail,
  RequestFilters,
  RequestStatus,
  RequestSummary,
} from "./types.js";

interface State {
  account: AccountSummary | undefined;
  requests: RequestSummary[];
  selectedId: string | undefined;
  filters: RequestFilters;
  loading: boolean;
}

const state: State = {
  account: undefined,
  requests: [],
  selectedId: undefined,
  filters: {},
  loading: true,
};

const loginView = byId<HTMLElement>("login-view");
const appView = byId<HTMLElement>("app-view");
const loginForm = byId<HTMLFormElement>("login-form");
const usernameInput = byId<HTMLInputElement>("username");
const passwordInput = byId<HTMLInputElement>("password");
const loginButton = byId<HTMLButtonElement>("login-button");
const loginError = byId<HTMLElement>("login-error");
const identity = byId<HTMLElement>("identity");
const statusSelect = byId<HTMLSelectElement>("status-filter");
const tagInput = byId<HTMLInputElement>("tag-filter");
const requestList = byId<HTMLElement>("request-list");
const summary = byId<HTMLElement>("summary");
const errorBanner = byId<HTMLElement>("error-banner");
const createRequestButton = byId<HTMLButtonElement>("create-request");
const createRequestDialog = byId<HTMLDialogElement>("create-request-dialog");
const createRequestForm = byId<HTMLFormElement>("create-request-form");
const createRequestSubmit = byId<HTMLButtonElement>("create-request-submit");
const createRequestError = byId<HTMLElement>("create-request-error");
const requestTitleInput = byId<HTMLInputElement>("request-title");
const detailDialog = byId<HTMLDialogElement>("request-dialog");
const detailContent = byId<HTMLElement>("dialog-content");

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void signIn();
});

byId<HTMLButtonElement>("logout").addEventListener("click", () => {
  void signOut();
});

statusSelect.addEventListener("change", () => {
  const status = statusSelect.value;
  const { status: _previousStatus, ...otherFilters } = state.filters;
  state.filters = status === ""
    ? otherFilters
    : { ...otherFilters, status: status as RequestStatus };
  void refreshRequests();
});

tagInput.addEventListener("change", () => {
  state.filters = { ...state.filters, tag: tagInput.value };
  void refreshRequests();
});

byId<HTMLButtonElement>("refresh").addEventListener("click", () => {
  void refreshRequests();
});

createRequestButton.addEventListener("click", () => {
  createRequestForm.reset();
  hideCreateRequestError();
  createRequestDialog.showModal();
  requestTitleInput.focus();
});

byId<HTMLButtonElement>("close-create-request").addEventListener("click", () => {
  createRequestDialog.close();
});

byId<HTMLButtonElement>("cancel-create-request").addEventListener("click", () => {
  createRequestDialog.close();
});

createRequestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitRequest();
});

byId<HTMLButtonElement>("close-dialog").addEventListener("click", () => {
  detailDialog.close();
});

void initialize();

async function initialize(): Promise<void> {
  try {
    showApp(await currentSession());
    await refreshRequests();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      showLogin();
      return;
    }
    showLogin(errorMessage(error));
  }
}

async function signIn(): Promise<void> {
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  hideLoginError();
  try {
    const account = await login(usernameInput.value, passwordInput.value);
    passwordInput.value = "";
    showApp(account);
    await refreshRequests();
  } catch (error) {
    showLogin(errorMessage(error));
    passwordInput.select();
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
}

async function signOut(): Promise<void> {
  try {
    await logout();
  } finally {
    state.account = undefined;
    state.requests = [];
    state.selectedId = undefined;
    createRequestDialog.close();
    detailDialog.close();
    showLogin();
  }
}

function showLogin(message?: string): void {
  appView.hidden = true;
  loginView.hidden = false;
  if (message === undefined) {
    hideLoginError();
  } else {
    loginError.textContent = message;
    loginError.hidden = false;
  }
  usernameInput.focus();
}

function showApp(account: AccountSummary): void {
  state.account = account;
  identity.replaceChildren(
    text("strong", account.displayName),
    text("span", roleLabel(account.role)),
  );
  createRequestButton.hidden = account.role !== "student";
  loginView.hidden = true;
  appView.hidden = false;
  hideError();
}

async function submitRequest(): Promise<void> {
  createRequestSubmit.disabled = true;
  createRequestSubmit.textContent = "Sending…";
  hideCreateRequestError();

  const form = new FormData(createRequestForm);
  try {
    const requestId = await createRequest({
      title: form.get("title")?.toString() ?? "",
      description: form.get("description")?.toString() ?? "",
      priority: (form.get("priority")?.toString() ?? "normal") as Priority,
      tags: (form.get("tags")?.toString() ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    });

    state.filters = {};
    statusSelect.value = "";
    tagInput.value = "";
    createRequestDialog.close();
    createRequestForm.reset();
    await refreshRequests();
    await openDetail(requestId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      createRequestDialog.close();
      handleAppError(error);
      return;
    }
    createRequestError.textContent = errorMessage(error);
    createRequestError.hidden = false;
  } finally {
    createRequestSubmit.disabled = false;
    createRequestSubmit.textContent = "Send request";
  }
}

async function refreshRequests(): Promise<void> {
  if (state.account === undefined) {
    return;
  }
  state.loading = true;
  renderList();
  hideError();
  try {
    state.requests = await listRequests(state.filters);
  } catch (error) {
    handleAppError(error);
  } finally {
    state.loading = false;
    renderList();
  }
}

function renderList(): void {
  clear(requestList);
  if (state.loading) {
    requestList.append(text("p", "Loading support requests…", "empty-state"));
    summary.textContent = "Loading";
    return;
  }

  summary.textContent = `${state.requests.length} ${
    state.requests.length === 1 ? "request" : "requests"
  }`;
  if (state.requests.length === 0) {
    const label = state.filters.status === undefined
      ? "No support requests match these filters."
      : `No ${state.filters.status} support requests match these filters.`;
    requestList.append(text("p", label, "empty-state"));
    return;
  }

  for (const request of state.requests) {
    requestList.append(renderCard(request));
  }
}

function renderCard(request: RequestSummary): HTMLElement {
  const card = document.createElement("article");
  card.className = `request-card priority-${request.priority}`;

  const headingRow = document.createElement("div");
  headingRow.className = "card-heading";
  const titleBox = document.createElement("div");
  titleBox.append(
    text("p", priorityLabel(request.priority), "priority-label"),
    text("h2", request.title),
  );
  headingRow.append(
    titleBox,
    text("span", request.status, `status status-${request.status}`),
  );

  const metadata = text(
    "p",
    `Student: ${request.requester.displayName} · Mentor: ${
      request.assignee?.displayName ?? "Not assigned"
    } · ${request.visibleNoteCount} ${
      request.visibleNoteCount === 1 ? "note" : "notes"
    }`,
    "metadata",
  );

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const tags = document.createElement("div");
  tags.className = "tags";
  for (const tag of request.tags) {
    tags.append(text("span", tag, "tag"));
  }
  footer.append(
    tags,
    button("View request", "button button-secondary", () => openDetail(request.id)),
  );

  card.append(
    headingRow,
    text("p", request.description, "description"),
    metadata,
    footer,
  );
  return card;
}

async function openDetail(requestId: string): Promise<void> {
  state.selectedId = requestId;
  clear(detailContent);
  detailContent.append(text("p", "Loading request…", "empty-state"));
  if (!detailDialog.open) {
    detailDialog.showModal();
  }

  try {
    const result = await getRequest(requestId);
    renderDetail(result.request, result.canWriteNotes);
  } catch (error) {
    detailDialog.close();
    handleAppError(error);
  }
}

function renderDetail(request: RequestDetail, canWriteNotes: boolean): void {
  clear(detailContent);
  const heading = document.createElement("div");
  heading.className = "detail-heading";
  heading.append(
    text("p", priorityLabel(request.priority), "priority-label"),
    text("h2", request.title),
    text(
      "p",
      `${request.status} · opened ${formatDate(request.createdAt)} by ${request.requester.displayName}`,
      "metadata",
    ),
  );
  detailContent.append(heading, text("p", request.description, "detail-description"));

  const actions = renderActions(request);
  if (actions.childElementCount > 0) {
    detailContent.append(actions);
  }

  const notesSection = document.createElement("section");
  notesSection.className = "notes";
  notesSection.append(text("h3", `Notes (${request.notes.length})`));
  if (request.notes.length === 0) {
    notesSection.append(text("p", "No visible notes yet.", "empty-state compact"));
  } else {
    for (const note of request.notes) {
      const item = document.createElement("article");
      item.className = `note note-${note.visibility}`;
      item.append(
        text(
          "p",
          `${note.author.displayName} · ${formatDate(note.createdAt)} · ${
            note.visibility === "staff" ? "Staff note" : "Public note"
          }`,
          "note-heading",
        ),
        text("p", note.body),
      );
      notesSection.append(item);
    }
  }
  detailContent.append(notesSection);

  if (canWriteNotes) {
    detailContent.append(renderNoteForm(request.id));
  }
}

function renderActions(request: RequestDetail): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "actions";
  const account = currentAccount();
  if (request.status === "open" && account.role !== "student") {
    actions.append(
      button("Claim request", "button button-primary", () =>
        runMutation(() => claimRequest(request.id))),
    );
  }
  if (request.status !== "resolved" && account.role !== "student") {
    actions.append(
      button("Mark resolved", "button button-secondary", () =>
        runMutation(() => resolveRequest(request.id))),
    );
  }
  return actions;
}

function renderNoteForm(requestId: string): HTMLElement {
  const form = document.createElement("form");
  form.className = "note-form";
  const label = text("label", "Note text", "field-label");
  const textarea = document.createElement("textarea");
  textarea.name = "body";
  textarea.rows = 4;
  textarea.required = true;
  label.append(textarea);

  const visibilityLabel = text("label", "Who can see it?", "field-label");
  const visibility = document.createElement("select");
  visibility.name = "visibility";
  visibility.append(new Option("Student and staff", "public"));
  visibility.append(new Option("Staff only", "staff"));
  visibilityLabel.append(visibility);

  const submit = text("button", "Add note", "button button-primary");
  submit.type = "submit";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void runMutation(() =>
      addNote({
        requestId,
        body: textarea.value,
        visibility: visibility.value as NoteVisibility,
      }),
    );
  });
  form.append(text("h3", "Add a note"), label, visibilityLabel, submit);
  return form;
}

async function runMutation(action: () => Promise<void>): Promise<void> {
  hideError();
  try {
    await action();
    await refreshRequests();
    if (state.selectedId !== undefined) {
      await openDetail(state.selectedId);
    }
  } catch (error) {
    handleAppError(error);
  }
}

function currentAccount(): AccountSummary {
  if (state.account === undefined) {
    throw new Error("Please sign in to continue.");
  }
  return state.account;
}

function priorityLabel(priority: RequestSummary["priority"]): string {
  return `${priority[0]?.toUpperCase() ?? ""}${priority.slice(1)} priority`;
}

function roleLabel(role: AccountSummary["role"]): string {
  return `${role[0]?.toUpperCase() ?? ""}${role.slice(1)}`;
}

function handleAppError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    state.account = undefined;
    showLogin(error.message);
    return;
  }
  showError(error);
}

function showError(error: unknown): void {
  errorBanner.textContent = errorMessage(error);
  errorBanner.hidden = false;
}

function hideError(): void {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function hideLoginError(): void {
  loginError.hidden = true;
  loginError.textContent = "";
}

function hideCreateRequestError(): void {
  createRequestError.hidden = true;
  createRequestError.textContent = "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
