import {
  formatTimestamp,
  normalizeClip,
  parseYouTubeUrl,
  validateClipDraft,
} from "./js/clip-model.mjs";

const STORAGE_KEY = "soundboard.clips.v1";

const state = {
  clips: [],
  search: "",
  activeClipId: null,
  editingClipId: null,
  toastTimer: null,
};

const elements = {
  emptyAddButton: document.querySelector("#empty-add-button"),
  importButton: document.querySelector("#import-button"),
  exportButton: document.querySelector("#export-button"),
  importOptionsDialog: document.querySelector("#import-options-dialog"),
  closeImportOptionsButton: document.querySelector(
    "#close-import-options-button",
  ),
  importFileButton: document.querySelector("#import-file-button"),
  exportOptionsDialog: document.querySelector("#export-options-dialog"),
  closeExportOptionsButton: document.querySelector(
    "#close-export-options-button",
  ),
  exportFileButton: document.querySelector("#export-file-button"),
  copyExportButton: document.querySelector("#copy-export-button"),
  pasteImportButton: document.querySelector("#paste-import-button"),
  importInput: document.querySelector("#import-input"),
  searchInput: document.querySelector("#search-input"),
  clipCount: document.querySelector("#clip-count"),
  clipGrid: document.querySelector("#clip-grid"),
  emptyState: document.querySelector("#empty-state"),
  clipDialog: document.querySelector("#clip-dialog"),
  clipForm: document.querySelector("#clip-form"),
  dialogTitle: document.querySelector("#dialog-title"),
  closeDialogButton: document.querySelector("#close-dialog-button"),
  titleInput: document.querySelector("#title-input"),
  urlInput: document.querySelector("#url-input"),
  startInput: document.querySelector("#start-input"),
  endInput: document.querySelector("#end-input"),
  formError: document.querySelector("#form-error"),
  jsonDialog: document.querySelector("#json-dialog"),
  jsonForm: document.querySelector("#json-form"),
  closeJsonDialogButton: document.querySelector("#close-json-dialog-button"),
  jsonInput: document.querySelector("#json-input"),
  jsonError: document.querySelector("#json-error"),
  playerHost: document.querySelector("#player-host"),
  toast: document.querySelector("#toast"),
};

class ClipStore {
  read() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const clips = stored ? JSON.parse(stored) : [];
      return Array.isArray(clips) ? clips : [];
    } catch {
      return [];
    }
  }

  write(clips) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
  }

  async list() {
    return this.read();
  }

  async put(clip) {
    const clips = this.read();
    const existingIndex = clips.findIndex(
      (storedClip) => String(storedClip.id) === String(clip.id),
    );

    if (existingIndex >= 0) {
      clips[existingIndex] = clip;
    } else {
      clips.push(clip);
    }

    this.write(clips);
  }

  async delete(id) {
    this.write(this.read().filter((clip) => clip.id !== id));
  }
}

const clipStore = new ClipStore();

let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (window.YT && typeof window.YT.Player === "function") {
    return Promise.resolve();
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.onYouTubeIframeAPIReady = previousReadyHandler;
      resolve();
    };
    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      window.onYouTubeIframeAPIReady = previousReadyHandler;
      reject(error);
    };

    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReadyHandler === "function") {
        previousReadyHandler();
      }
      finish();
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () =>
        fail(new Error("The YouTube player API could not be loaded."));
      document.head.append(script);
    }

    window.setTimeout(
      () => fail(new Error("The YouTube player API took too long to load.")),
      15000,
    );
  });

  return youtubeApiPromise;
}

class YouTubePlayer {
  constructor(host, onEvent) {
    this.host = host;
    this.onEvent = onEvent;
    this.player = null;
    this.currentClip = null;
    this.ready = false;
    this.monitorTimer = null;
    this.initialization = this.initialize().catch((error) => {
      this.onEvent({ type: "error", message: error.message });
      return null;
    });
  }

  async initialize() {
    await loadYouTubeApi();
    const playerVars = {
      controls: 1,
      enablejsapi: 1,
      playsinline: 1,
      rel: 0,
    };

    if (
      window.location.protocol === "http:" ||
      window.location.protocol === "https:"
    ) {
      playerVars.origin = window.location.origin;
    }

    this.host.replaceChildren();

    return new Promise((resolve) => {
      this.player = new window.YT.Player(this.host, {
        width: "100%",
        height: "220",
        playerVars,
        events: {
          onReady: () => {
            this.ready = true;
            this.onEvent({ type: "ready" });
            resolve(this.player);
          },
          onStateChange: (event) => this.handleStateChange(event),
          onError: (event) => this.handleError(event),
        },
      });
    });
  }

  async play(clip) {
    this.currentClip = clip;
    this.onEvent({ type: "loading", clip });
    const player = await this.initialization;

    if (!player || !this.ready) {
      throw new Error("The YouTube player is not available yet.");
    }

    this.clearMonitor();
    player.loadVideoById({
      videoId: clip.videoId,
      startSeconds: clip.start,
      endSeconds: clip.end,
    });
    player.playVideo();
    this.startMonitor();
  }

  stop() {
    this.clearMonitor();
    this.currentClip = null;

    if (this.player && this.ready) {
      this.player.stopVideo();
    }
  }

  startMonitor() {
    this.clearMonitor();
    this.monitorTimer = window.setInterval(() => {
      if (
        !this.currentClip ||
        !this.player ||
        typeof this.player.getCurrentTime !== "function"
      ) {
        return;
      }

      const currentTime = this.player.getCurrentTime();

      if (Number.isFinite(currentTime) && currentTime >= this.currentClip.end) {
        const finishedClip = this.currentClip;
        this.player.pauseVideo();
        this.clearMonitor();
        this.onEvent({ type: "ended", clip: finishedClip });
      }
    }, 60);
  }

  clearMonitor() {
    if (this.monitorTimer) {
      window.clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  handleStateChange(event) {
    const stateMap = {
      [-1]: "unstarted",
      [0]: "ended",
      [1]: "playing",
      [2]: "paused",
      [3]: "buffering",
    };
    const type = stateMap[event.data] || "unknown";

    if (type === "playing") {
      this.startMonitor();
    }

    if (type === "ended") {
      this.clearMonitor();
    }

    this.onEvent({ type, clip: this.currentClip });
  }

  handleError(event) {
    const messages = {
      2: "YouTube rejected the video request.",
      5: "The video cannot be played in the HTML5 player.",
      100: "This video is unavailable or private.",
      101: "This video does not allow embedded playback.",
      150: "This video does not allow embedded playback.",
      153: "YouTube could not verify the player request.",
    };

    this.clearMonitor();
    this.onEvent({
      type: "error",
      clip: this.currentClip,
      message: messages[event.data] || "YouTube could not play this video.",
    });
  }
}

let youtubePlayer;

function getVisibleClips() {
  const query = state.search.trim().toLowerCase();

  return [...state.clips]
    .sort((firstClip, secondClip) => firstClip.order - secondClip.order)
    .filter(
      (clip) =>
        !query || `${clip.title} ${clip.videoId}`.toLowerCase().includes(query),
    );
}

function findClipById(id) {
  return state.clips.find((clip) => String(clip.id) === String(id));
}

function createTileAction(action, label, iconCodePoint) {
  const button = document.createElement("button");
  button.className = `tile-action${action === "delete" ? " delete" : ""}`;
  button.type = "button";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.title = `${label} clip`;

  const icon = document.createElement("span");
  icon.className = "tile-action-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = String.fromCodePoint(iconCodePoint);
  button.append(icon);

  return button;
}

function updateCounts() {
  const countText = `${state.clips.length} ${state.clips.length === 1 ? "clip" : "clips"}`;
  elements.clipCount.textContent = countText;
}

function createClipTile(clip, index) {
  const tile = document.createElement("article");
  tile.className = "clip-tile";
  tile.dataset.clipId = clip.id;
  tile.setAttribute("role", "listitem");

  if (String(clip.id) === String(state.activeClipId)) {
    tile.classList.add("is-active");
  }

  const playButton = document.createElement("button");
  playButton.className = "clip-trigger";
  playButton.type = "button";
  playButton.dataset.action = "play";
  playButton.dataset.clipId = clip.id;
  playButton.setAttribute("aria-label", `Play ${clip.title}`);

  const indexLabel = document.createElement("span");
  indexLabel.className = "tile-index";
  indexLabel.textContent = String(index + 1).padStart(2, "0");

  const title = document.createElement("span");
  title.className = "tile-title";
  title.title = clip.title;
  title.textContent = clip.title;

  playButton.append(indexLabel, title);

  const actions = document.createElement("div");
  actions.className = "tile-actions";

  const editButton = createTileAction("edit", "Edit", 0x270e);
  editButton.dataset.clipId = clip.id;

  const deleteButton = createTileAction("delete", "Delete", 0x1f5d1);
  deleteButton.dataset.clipId = clip.id;

  actions.append(editButton, deleteButton);
  tile.append(playButton, actions);
  return tile;
}

function createAddClipTile() {
  const tile = document.createElement("article");
  tile.className = "clip-tile add-clip-tile";
  tile.setAttribute("role", "listitem");

  const button = document.createElement("button");
  button.className = "add-clip-trigger";
  button.type = "button";
  button.dataset.action = "add";
  button.setAttribute("aria-label", "Add a clip");

  const mark = document.createElement("span");
  mark.className = "add-clip-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "+";

  button.append(mark);
  tile.append(button);
  return tile;
}

function render() {
  updateCounts();
  const visibleClips = getVisibleClips();
  elements.clipGrid.replaceChildren();
  elements.emptyState.hidden = state.clips.length > 0;
  elements.clipGrid.hidden = state.clips.length === 0;

  if (state.clips.length > 0 && visibleClips.length === 0) {
    const noResults = document.createElement("p");
    noResults.className = "no-results";
    noResults.textContent = "No clips match that search.";
    elements.clipGrid.append(noResults);
  }

  visibleClips.forEach((clip, index) =>
    elements.clipGrid.append(createClipTile(clip, index)),
  );

  if (state.clips.length > 0) {
    elements.clipGrid.append(createAddClipTile());
  }
}

function handlePlayerEvent(event) {
  if (event.type === "playing") {
    state.activeClipId = event.clip?.id || state.activeClipId;
    render();
  } else if (event.type === "ended") {
    state.activeClipId = null;
    render();
  } else if (event.type === "error") {
    showToast(event.message);
  }
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.hidden = false;
  elements.toast.textContent = message;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function openDialog(clip = null) {
  state.editingClipId = clip?.id || null;
  elements.dialogTitle.textContent = clip ? "Edit clip" : "New clip";
  elements.clipForm.reset();
  elements.formError.hidden = true;
  elements.formError.textContent = "";
  elements.startInput.value = clip ? formatTimestamp(clip.start) : "0:00";

  if (clip) {
    elements.titleInput.value = clip.title;
    elements.urlInput.value = `https://www.youtube.com/watch?v=${clip.videoId}`;
    elements.endInput.value = formatTimestamp(clip.end);
  }

  elements.clipDialog.showModal();
  window.setTimeout(() => elements.titleInput.focus(), 0);
}

function closeDialog() {
  elements.clipDialog.close();
  state.editingClipId = null;
  elements.formError.hidden = true;
}

function showFormError(message) {
  elements.formError.hidden = false;
  elements.formError.textContent = message;
}

function readFormClip() {
  const previousClip = state.clips.find(
    (clip) => clip.id === state.editingClipId,
  );
  return validateClipDraft(
    {
      title: elements.titleInput.value,
      url: elements.urlInput.value,
      start: elements.startInput.value,
      end: elements.endInput.value,
      order: previousClip?.order ?? state.clips.length,
    },
    state.editingClipId,
  );
}

async function saveClip(event) {
  event.preventDefault();

  try {
    const wasEditing = Boolean(state.editingClipId);
    const clip = readFormClip();
    await clipStore.put(clip);
    const existingIndex = state.clips.findIndex(
      (storedClip) => String(storedClip.id) === String(clip.id),
    );

    if (existingIndex >= 0) {
      state.clips[existingIndex] = clip;
    } else {
      state.clips.push(clip);
    }

    render();
    closeDialog();
    showToast(wasEditing ? "Clip updated." : "Clip saved.");
  } catch (error) {
    showFormError(error.message);
  }
}

async function playClip(id) {
  const clip = findClipById(id);

  if (!clip) {
    return;
  }

  state.activeClipId = clip.id;
  render();

  try {
    await youtubePlayer.play(clip);
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteClip(id) {
  const clip = findClipById(id);

  if (!clip || !window.confirm(`Delete "${clip.title}"?`)) {
    return;
  }

  await clipStore.delete(id);
  state.clips = state.clips.filter(
    (storedClip) => String(storedClip.id) !== String(id),
  );

  if (String(state.activeClipId) === String(id)) {
    state.activeClipId = null;
    youtubePlayer.stop();
  }

  render();
  showToast("Clip deleted.");
}

function handleGridClick(event) {
  const clickedElement =
    event.target instanceof Element
      ? event.target
      : event.target?.parentElement;
  const actionTarget = clickedElement?.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const { action, clipId } = actionTarget.dataset;

  if (action === "play") {
    playClip(clipId);
  } else if (action === "edit") {
    const clip = findClipById(clipId);
    if (clip) {
      openDialog(clip);
    }
  } else if (action === "delete") {
    deleteClip(clipId);
  } else if (action === "add") {
    openDialog();
  }
}

function createBoardPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clips: state.clips,
  };
}

function getBoardJson() {
  return JSON.stringify(createBoardPayload(), null, 2);
}

function exportBoard() {
  const blob = new Blob([getBoardJson()], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "soundboard-board.json";
  link.click();
  URL.revokeObjectURL(downloadUrl);
  showToast("Board exported.");
}

async function copyBoard() {
  try {
    const boardJson = getBoardJson();

    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(boardJson);
    } else {
      const clipboardInput = document.createElement("textarea");
      clipboardInput.value = boardJson;
      clipboardInput.setAttribute("readonly", "");
      clipboardInput.style.position = "fixed";
      clipboardInput.style.opacity = "0";
      document.body.append(clipboardInput);
      clipboardInput.select();
      const copied = document.execCommand("copy");
      clipboardInput.remove();

      if (!copied) {
        throw new Error("Clipboard access is unavailable.");
      }
    }

    showToast("Board copied to clipboard.");
  } catch {
    showToast("Could not copy the board. Use Export instead.");
  }
}

async function importBoardText(rawText) {
  if (!String(rawText).trim()) {
    throw new Error("Paste board JSON first.");
  }

  const parsed = JSON.parse(rawText);
  const rawClips = Array.isArray(parsed) ? parsed : parsed?.clips;

  if (!Array.isArray(rawClips)) {
    throw new Error("This JSON does not contain a clip list.");
  }

  const existingIds = new Set(state.clips.map((clip) => String(clip.id)));
  const firstOrder =
    state.clips.reduce(
      (largestOrder, clip) => Math.max(largestOrder, clip.order),
      -1,
    ) + 1;
  const importedClips = [];
  let duplicateCount = 0;

  rawClips.forEach((rawClip, index) => {
    const rawId = rawClip && rawClip.id != null ? String(rawClip.id) : "";

    if (rawId && existingIds.has(rawId)) {
      duplicateCount += 1;
      return;
    }

    try {
      const normalized = normalizeClip(
        {
          ...rawClip,
          id: rawClip?.id,
          order: firstOrder + index,
        },
        firstOrder + index,
      );

      if (existingIds.has(normalized.id)) {
        duplicateCount += 1;
        return;
      }

      existingIds.add(normalized.id);
      importedClips.push(normalized);
    } catch {
      // Invalid imported entries are skipped and reported below.
    }
  });

  if (importedClips.length === 0 && duplicateCount === 0) {
    throw new Error("No valid clips were found in that JSON.");
  }

  await Promise.all(importedClips.map((clip) => clipStore.put(clip)));
  state.clips.push(...importedClips);
  render();
  return { importedCount: importedClips.length, duplicateCount };
}

function formatImportMessage({ importedCount, duplicateCount }) {
  const importedMessage =
    importedCount > 0
      ? `${importedCount} clip${importedCount === 1 ? "" : "s"} imported`
      : "No new clips imported";

  if (duplicateCount === 0) {
    return `${importedMessage}.`;
  }

  return `${importedMessage}; ${duplicateCount} duplicate clip${duplicateCount === 1 ? "" : "s"} skipped.`;
}

function closeDialogElement(dialog) {
  if (dialog.open) {
    dialog.close();
  }
}

function openImportOptionsDialog() {
  elements.importOptionsDialog.showModal();
}

function closeImportOptionsDialog() {
  closeDialogElement(elements.importOptionsDialog);
}

function openExportOptionsDialog() {
  elements.exportOptionsDialog.showModal();
}

function closeExportOptionsDialog() {
  closeDialogElement(elements.exportOptionsDialog);
}

function showJsonError(message) {
  elements.jsonError.hidden = false;
  elements.jsonError.textContent = message;
}

function openJsonDialog() {
  closeImportOptionsDialog();
  elements.jsonInput.value = "";
  elements.jsonError.hidden = true;
  elements.jsonError.textContent = "";
  elements.jsonDialog.showModal();
  window.setTimeout(() => elements.jsonInput.focus(), 0);
}

function closeJsonDialog() {
  closeDialogElement(elements.jsonDialog);
  elements.jsonError.hidden = true;
}

async function submitJsonImport(event) {
  event.preventDefault();

  try {
    const importResult = await importBoardText(elements.jsonInput.value);
    closeJsonDialog();
    showToast(formatImportMessage(importResult));
  } catch (error) {
    showJsonError(error.message);
  }
}

async function importBoard(event) {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  closeImportOptionsDialog();

  try {
    const importResult = await importBoardText(await file.text());
    showToast(formatImportMessage(importResult));
  } catch (error) {
    showToast(error.message);
  } finally {
    event.target.value = "";
  }
}

function handleKeyboard(event) {
  const tagName = event.target.tagName.toLowerCase();

  if (
    elements.clipDialog.open ||
    elements.jsonDialog.open ||
    elements.importOptionsDialog.open ||
    elements.exportOptionsDialog.open ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  ) {
    return;
  }

  const number = Number(event.key);

  if (number >= 1 && number <= 9) {
    const clip = getVisibleClips()[number - 1];
    if (clip) {
      playClip(clip.id);
    }
  }
}

function bindEvents() {
  elements.emptyAddButton.addEventListener("click", () => openDialog());
  elements.importButton.addEventListener("click", openImportOptionsDialog);
  elements.closeImportOptionsButton.addEventListener(
    "click",
    closeImportOptionsDialog,
  );
  elements.importFileButton.addEventListener("click", () => {
    closeImportOptionsDialog();
    elements.importInput.click();
  });
  elements.exportButton.addEventListener("click", openExportOptionsDialog);
  elements.closeExportOptionsButton.addEventListener(
    "click",
    closeExportOptionsDialog,
  );
  elements.exportFileButton.addEventListener("click", () => {
    closeExportOptionsDialog();
    exportBoard();
  });
  elements.copyExportButton.addEventListener("click", () => {
    closeExportOptionsDialog();
    copyBoard();
  });
  elements.closeDialogButton.addEventListener("click", closeDialog);
  elements.clipForm.addEventListener("submit", saveClip);
  elements.clipGrid.addEventListener("click", handleGridClick);
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  elements.pasteImportButton.addEventListener("click", openJsonDialog);
  elements.importInput.addEventListener("change", importBoard);
  elements.jsonForm.addEventListener("submit", submitJsonImport);
  elements.closeJsonDialogButton.addEventListener("click", closeJsonDialog);
  document.addEventListener("keydown", handleKeyboard);
  elements.clipDialog.addEventListener("click", (event) => {
    if (event.target === elements.clipDialog) {
      closeDialog();
    }
  });
  elements.importOptionsDialog.addEventListener("click", (event) => {
    if (event.target === elements.importOptionsDialog) {
      closeImportOptionsDialog();
    }
  });
  elements.exportOptionsDialog.addEventListener("click", (event) => {
    if (event.target === elements.exportOptionsDialog) {
      closeExportOptionsDialog();
    }
  });
  elements.jsonDialog.addEventListener("click", (event) => {
    if (event.target === elements.jsonDialog) {
      closeJsonDialog();
    }
  });
}

async function loadClips() {
  const storedClips = await clipStore.list();
  const normalizedClips = [];

  storedClips.forEach((rawClip, index) => {
    try {
      normalizedClips.push(normalizeClip(rawClip, index));
    } catch {
      // Stale or manually edited browser records are ignored.
    }
  });

  state.clips = normalizedClips;
  clipStore.write(normalizedClips);
}

async function initialize() {
  bindEvents();
  await loadClips();
  render();
  youtubePlayer = new YouTubePlayer(elements.playerHost, handlePlayerEvent);
}

initialize().catch((error) => {
  showToast(error.message);
});
