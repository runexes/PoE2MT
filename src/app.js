(function () {
  const TAIL_LINES = 3000;
  const TAIL_BYTES = 1600 * 1024;
  const REVERSE_SCAN_CHUNK_BYTES = 1024 * 1024;
  const POLL_MS = 3000;
  const HISTORY_PAGE_SIZE = 250;
  const DB_NAME = "poe2-map-tracker";
  const STORE_NAME = "settings";
  const REQUIRED_LOG_FILE = "Client.txt";
  const STATE_VERSION = 12;
  const DEFAULT_START_DATE = "2026-09-04";
  const DEFAULT_LANGUAGE = "en";
  const LOG_READ_CHUNK = 256 * 1024;

  const isElectron = Boolean(window.statsServer);

  class RemoteClientFile {
    constructor(filePath) {
      this.filePath = filePath;
      this.lastSize = 0;
    }

    get name() {
      return REQUIRED_LOG_FILE;
    }

    get size() {
      return this.lastSize;
    }

    async refresh() {
      if (!window.statsServer?.logInfo) return this.lastSize;
      try {
        const info = await window.statsServer.logInfo(this.filePath);
        if (info && Number.isFinite(info.size)) this.lastSize = info.size;
      } catch {
        return this.lastSize;
      }
      return this.lastSize;
    }

    async readRange(start, length) {
      const data = await window.statsServer.logRead(this.filePath, start, length);
      return data || new Uint8Array(0);
    }

    async requestPermission() {
      return "granted";
    }

    async getFile() {
      await this.refresh();
      return this;
    }

    slice(start = 0, end = this.lastSize) {
      const file = this;
      const startPos = Math.max(0, start);
      const endPos = Math.max(startPos, Math.min(end, file.lastSize));
      return {
        text: async () => {
          const data = await file.readRange(startPos, endPos - startPos);
          return new TextDecoder("utf-8").decode(data);
        },
        stream: () => ({
          getReader: () => remoteStreamReader(file, startPos, endPos)
        })
      };
    }
  }

  function remoteStreamReader(file, start, end) {
    let offset = start;
    return {
      async read() {
        if (offset >= end) return { value: undefined, done: true };
        const length = Math.min(LOG_READ_CHUNK, end - offset);
        const data = await file.readRange(offset, length);
        if (!data || data.byteLength === 0) return { value: undefined, done: true };
        offset += data.byteLength;
        return { value: data, done: false };
      },
      async cancel() {
        offset = end;
      },
      releaseLock() {}
    };
  }

  const DEFAULT_TEMPLATE = [
    "Simulacrum: {location_count:Simulacrum of Delusion}",
    "Voices: 0"
  ].join("\n");
  const OVERLAY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

  let overlays = [];
  let overlayManagerOpen = false;
  let serverRunning = false;
  let configSaveTimer = null;

  const els = {
    nativePicker: document.getElementById("nativePicker"),
    fallbackControl: document.getElementById("fallbackControl"),
    fallbackButton: document.getElementById("fallbackButton"),
    fallbackPicker: document.getElementById("fallbackPicker"),
    fullScan: document.getElementById("fullScan"),
    realtimeToggle: document.getElementById("realtimeToggle"),
    clearData: document.getElementById("clearData"),
    controlBand: document.querySelector(".control-band"),
    dateField: document.querySelector(".date-field"),
    startDate: document.getElementById("startDate"),
    characterName: document.getElementById("characterName"),
    watchStatus: document.getElementById("watchStatus"),
    setupGuide: document.getElementById("setupGuide"),
    fileName: document.getElementById("fileName"),
    scanMeta: document.getElementById("scanMeta"),
    progressBar: document.getElementById("progressBar"),
    mapCount: document.getElementById("mapCount"),
    anomalyCount: document.getElementById("anomalyCount"),
    citadelCount: document.getElementById("citadelCount"),
    expeditionCount: document.getElementById("expeditionCount"),
    bossCount: document.getElementById("bossCount"),
    deathCount: document.getElementById("deathCount"),
    lastArea: document.getElementById("lastArea"),
    summaryGrid: document.getElementById("summaryGrid"),
    statsBand: document.getElementById("statsBand"),
    statsHeader: document.getElementById("statsHeader"),
    statsHint: document.getElementById("statsHint"),
    locationStats: document.getElementById("locationStats"),
    tableWrap: document.getElementById("tableWrap"),
    workspace: document.getElementById("workspace"),
    historyBody: document.getElementById("historyBody"),
    searchBox: document.getElementById("searchBox"),
    afterLoad: Array.from(document.querySelectorAll(".after-load")),
    filters: Array.from(document.querySelectorAll(".filter")),
    streamToggle: document.getElementById("streamToggle"),
    overlayManager: document.getElementById("overlayManager"),
    overlayList: document.getElementById("overlayList"),
    addOverlay: document.getElementById("addOverlay"),
    statsPort: document.getElementById("statsPort"),
    autoStart: document.getElementById("autoStart"),
    serverStart: document.getElementById("serverStart"),
    serverStatus: document.getElementById("serverStatus"),
    langToggle: document.getElementById("langToggle")
  };

  const wikiRows = window.POE2_LOCATION_DATA.maps.map(([name, type, biome, boss]) => ({
    name,
    type,
    biome,
    boss,
    key: normalize(name),
    codeKey: normalizeCodeName(name)
  }));
  const wikiByName = new Map(wikiRows.map((row) => [row.key, row]));
  const wikiByCodeName = new Map(wikiRows.map((row) => [row.codeKey, row]));
  const HIDDEN_TYPES = new Set(["hideout", "town"]);

  let state = {
    fileHandle: null,
    file: null,
    fileName: "",
    filePath: "",
    lastSize: 0,
    pending: null,
    records: [],
    deaths: [],
    activeFilter: "all",
    search: "",
    locationFilter: null,
    visibleRows: HISTORY_PAGE_SIZE,
    startDate: DEFAULT_START_DATE,
    characterName: "",
    realtime: true,
    statsExpanded: false,
    pollTimer: null,
    generation: 0,
    language: DEFAULT_LANGUAGE,
    messages: {},
    serverInfo: null
  };

  init();

  async function init() {
    wireEvents();
    await initI18n();
    await Promise.all([initStatsServer(), restoreSavedState()]);
    applyTranslations();
    updateLangToggle();
    render();
  }

  function initI18n() {
    if (!window.statsServer?.i18nGet) {
      state.language = DEFAULT_LANGUAGE;
      state.messages = {};
      return Promise.resolve();
    }
    return window.statsServer
      .i18nGet()
      .then((info) => {
        state.language = info?.language || DEFAULT_LANGUAGE;
        state.messages = info?.messages || {};
      })
      .catch(() => {
        state.messages = state.messages || {};
      });
  }

  function t(key, params) {
    const template = state.messages?.[key];
    if (template == null) return key;
    if (!params) return template;
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match
    );
  }

  function applyTranslations(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
    });
  }

  function updateLangToggle() {
    if (!els.langToggle) return;
    els.langToggle.textContent = state.language === "ru" ? "RU" : "EN";
  }

  function toggleLanguage() {
    const next = state.language === "ru" ? "en" : "ru";
    setLanguage(next);
  }

  function setLanguage(language) {
    state.language = language;
    updateLangToggle();
    const save = persistConfig();
    const load = window.statsServer?.i18nGet
      ? save.then(() => window.statsServer.i18nGet())
      : Promise.resolve({ language, messages: {} });
    load
      .then((info) => {
        state.language = info?.language || language;
        state.messages = info?.messages || {};
        applyTranslations();
        updateLangToggle();
        if (overlayManagerOpen) renderOverlayList();
        render();
      })
      .catch(() => {});
  }

  function wireEvents() {
    els.nativePicker.addEventListener("click", chooseNativeFile);
    els.fallbackButton.addEventListener("click", openFallbackPicker);
    els.fallbackPicker.addEventListener("change", chooseFallbackFile);
    els.fullScan.addEventListener("click", () => fullScan());
    els.realtimeToggle.addEventListener("click", toggleRealtime);
    els.clearData.addEventListener("click", clearData);
    els.dateField.addEventListener("click", openDatePicker);
    els.startDate.addEventListener("change", () => {
      state.startDate = els.startDate.value;
      saveLocalState();
      if (state.file || state.fileHandle) fullScan();
    });
    els.characterName.addEventListener("change", () => {
      state.characterName = normalizeCharacterName(els.characterName.value);
      els.characterName.value = state.characterName;
      saveLocalState();
      if (state.file || state.fileHandle) fullScan();
    });
    els.statsHeader.addEventListener("click", toggleStats);
    els.locationStats.addEventListener("click", (event) => {
      const row = event.target.closest(".stat-row");
      if (row) applyLocationFilter(row.dataset.locationName, row.dataset.locationType);
    });
    els.locationStats.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest(".stat-row");
      if (!row) return;
      event.preventDefault();
      applyLocationFilter(row.dataset.locationName, row.dataset.locationType);
    });
    els.searchBox.addEventListener("input", (event) => {
      state.locationFilter = null;
      state.search = normalizeSearch(event.target.value);
      resetVisibleRows();
      renderLocationStats();
      renderOverlays();
      renderTable();
    });
    els.tableWrap.addEventListener("scroll", handleTableScroll);
    els.filters.forEach((button) => {
      button.addEventListener("click", () => {
        state.locationFilter = null;
        state.activeFilter = button.dataset.filter;
        syncFilterButtons();
        resetVisibleRows();
        renderLocationStats();
        renderOverlays();
        renderTable();
      });
    });

    els.streamToggle.addEventListener("click", toggleOverlayManager);
    els.addOverlay.addEventListener("click", addOverlay);
    els.langToggle.addEventListener("click", toggleLanguage);
    els.serverStart.addEventListener("click", toggleServer);
    els.statsPort.addEventListener("change", persistConfig);
    els.autoStart.addEventListener("change", persistConfig);
    els.overlayList.addEventListener("input", handleOverlayInput);
    els.overlayList.addEventListener("change", handleOverlayChange);
    els.overlayList.addEventListener("click", handleOverlayClick);
  }

  function getTemplateVariables() {
    const countByType = (type) =>
      state.records.filter((record) => record.type === type).length;

    const lastVisible = state.records
      .filter((record) => !isHiddenRecord(record))
      .at(-1);

    return {
      maps_completed: countByType("map"),
      anomalies: countByType("anomaly"),
      citadels: countByType("citadel"),
      expeditions: countByType("expedition"),
      bosses: state.records.filter(
        (record) => record.type === "boss" || record.type === "special"
      ).length,
      deaths: state.deaths.length,
      current_location: state.pending?.name ?? "",
      last_area: lastVisible?.name ?? "-",
      character_name: state.characterName || "",
      ...getSelectedMapVariables()
    };
  }

  function locationStatsFor(name) {
    if (!name) return null;
    return state.locations?.get(normalize(name)) || null;
  }

  function locationVariables(selected) {
    if (!selected) {
      return {
        selected_map_count: 0,
        selected_map_name: "",
        selected_map_avg: "",
        selected_map_deaths: 0
      };
    }

    const averageMs = selected.timedCount ? selected.totalMs / selected.timedCount : 0;
    return {
      selected_map_count: selected.count,
      selected_map_name: selected.name,
      selected_map_avg: averageMs ? formatDuration(averageMs) : "",
      selected_map_deaths: selected.deaths
    };
  }

  function getSelectedMapVariables() {
    const selected = state.locationFilter
      ? locationStatsFor(state.locationFilter.key)
      : null;
    return locationVariables(selected);
  }

  const DYNAMIC_VARIABLE_TARGETS = {
    location_count: "selected_map_count",
    location_avg: "selected_map_avg",
    location_deaths: "selected_map_deaths"
  };

  function resolveDynamicVariable(key, arg) {
    const target = DYNAMIC_VARIABLE_TARGETS[key];
    if (!target) return null;
    const selected = locationStatsFor(arg);
    if (!selected) return null;
    return locationVariables(selected)[target];
  }

  function renderTemplate(template, variables) {
    return template.replace(
      /\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]+))?\}/g,
      (match, key, arg) => {
        if (arg !== undefined) {
          const value = resolveDynamicVariable(key, arg.trim());
          return value != null ? String(value) : match;
        }
        return Object.prototype.hasOwnProperty.call(variables, key)
          ? String(variables[key])
          : match;
      }
    );
  }

  function renderOverlays() {
    const variables = getTemplateVariables();

    overlays.forEach((overlay, index) => {
      overlay.rendered = renderTemplate(overlay.template, variables);
      const card = els.overlayList.querySelector(
        `.overlay-card[data-index="${index}"]`
      );
      const preview = card?.querySelector(".overlay-preview");
      if (preview) preview.textContent = overlay.rendered;
      window.statsServer?.publish({
        overlayId: overlay.id,
        text: overlay.rendered,
        variables
      });
    });
  }

  function publishOverlay(index) {
    const overlay = overlays[index];
    if (!overlay) return;

    const variables = getTemplateVariables();
    overlay.rendered = renderTemplate(overlay.template, variables);

    const card = els.overlayList.querySelector(
      `.overlay-card[data-index="${index}"]`
    );
    const preview = card?.querySelector(".overlay-preview");
    if (preview) preview.textContent = overlay.rendered;

    window.statsServer?.publish({
      overlayId: overlay.id,
      text: overlay.rendered,
      variables
    });
  }

  function renderOverlayList() {
    els.overlayList.innerHTML = "";
    overlays.forEach((overlay, index) => {
      const card = document.createElement("div");
      card.className = "overlay-card";
      card.dataset.index = String(index);
      const url = overlayUrl(overlay.id);
      card.innerHTML = [
        '<div class="overlay-card-head">',
        '<label class="field"><span>ID</span>',
        `<input class="overlay-id" type="text" value="${escapeHtml(overlay.id)}" spellcheck="false" autocomplete="off" />`,
        "</label>",
        '<button class="overlay-delete" type="button" title="' + escapeHtml(t("overlay.remove")) + '" aria-label="' + escapeHtml(t("overlay.remove")) + '">X</button>',
        "</div>",
        `<textarea class="overlay-template" rows="5" spellcheck="false" aria-label="${escapeHtml(t("overlay.templateLabel"))}">${escapeHtml(overlay.template)}</textarea>`,
        `<button class="overlay-url" type="button" data-url="${escapeHtml(url)}" title="${escapeHtml(t("overlay.copyLink"))}">${escapeHtml(url)}</button>`,
        `<pre class="overlay-preview">${escapeHtml(overlay.rendered)}</pre>`
      ].join("");
      els.overlayList.appendChild(card);
    });
  }

  function overlayUrl(overlayId) {
    const port = Number(els.statsPort.value) || 8080;
    return `http://localhost:${port}/overlays/map/${encodeURIComponent(overlayId)}`;
  }

  function uniqueOverlayId() {
    let index = overlays.length + 1;
    let candidate = `map-${index}`;
    while (overlays.some((overlay) => overlay.id === candidate)) {
      index += 1;
      candidate = `map-${index}`;
    }
    return candidate;
  }

  function addOverlay() {
    overlays.push({ id: uniqueOverlayId(), template: DEFAULT_TEMPLATE, rendered: "" });
    renderOverlayList();
    persistConfig();
    renderOverlays();
  }

  function toggleOverlayManager() {
    overlayManagerOpen = !overlayManagerOpen;
    applyOverlayManagerState(true);
    if (overlayManagerOpen) renderOverlayList();
    persistConfig();
  }

  function applyOverlayManagerState(showToggle) {
    els.streamToggle.hidden = !showToggle;
    if (!showToggle) {
      els.overlayManager.hidden = true;
      els.streamToggle.textContent = t("topbar.streamShow");
      els.streamToggle.setAttribute("aria-pressed", "false");
      els.streamToggle.classList.remove("active-toggle");
      return;
    }
    els.overlayManager.hidden = !overlayManagerOpen;
    els.streamToggle.textContent = overlayManagerOpen
      ? t("topbar.streamHide")
      : t("topbar.streamShow");
    els.streamToggle.setAttribute("aria-pressed", String(overlayManagerOpen));
    els.streamToggle.classList.toggle("active-toggle", overlayManagerOpen);
  }

  function isValidOverlayId(value) {
    return OVERLAY_ID_PATTERN.test(value);
  }

  function handleOverlayInput(event) {
    const field = event.target.closest(".overlay-template");
    if (!field) return;
    const card = field.closest(".overlay-card");
    const index = Number(card.dataset.index);
    if (!overlays[index]) return;
    overlays[index].template = field.value;
    publishOverlay(index);
    scheduleConfigSave();
  }

  function handleOverlayChange(event) {
    const field = event.target.closest(".overlay-id");
    if (!field) return;
    const card = field.closest(".overlay-card");
    const index = Number(card.dataset.index);
    const overlay = overlays[index];
    if (!overlay) return;

    const nextId = field.value.trim();
    if (!isValidOverlayId(nextId)) {
      field.value = overlay.id;
      els.serverStatus.textContent = t("server.idInvalid");
      setServerStatusError(true);
      return;
    }
    if (overlays.some((item, itemIndex) => itemIndex !== index && item.id === nextId)) {
      field.value = overlay.id;
      els.serverStatus.textContent = t("server.idDuplicate");
      setServerStatusError(true);
      return;
    }

    overlay.id = nextId;
    renderOverlayList();
    persistConfig();
    renderOverlays();
  }

  function handleOverlayClick(event) {
    const urlElement = event.target.closest(".overlay-url");
    if (urlElement) {
      const url = urlElement.dataset.url || "";
      copyToClipboard(url).then((ok) => flashUrl(urlElement, url, ok));
      return;
    }
    const button = event.target.closest(".overlay-delete");
    if (!button) return;
    const card = button.closest(".overlay-card");
    const index = Number(card.dataset.index);
    if (!overlays[index]) return;
    overlays.splice(index, 1);
    renderOverlayList();
    persistConfig();
    renderOverlays();
  }

  function copyToClipboard(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard
        .writeText(text)
        .then(() => true)
        .catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }

  function flashUrl(element, url, ok) {
    clearTimeout(element.copyTimer);
    element.classList.toggle("overlay-url-done", ok);
    element.classList.toggle("overlay-url-error", !ok);
    element.textContent = ok ? t("overlay.copied") : t("overlay.copyFailed");
    element.copyTimer = setTimeout(() => {
      element.classList.remove("overlay-url-done", "overlay-url-error");
      element.textContent = url;
    }, 1200);
  }

  function initStatsServer() {
    if (!window.statsServer) {
      els.streamToggle.hidden = true;
      if (els.overlayManager) els.overlayManager.hidden = true;
      return Promise.resolve();
    }

    return window.statsServer
      .getConfig()
      .then((info) => {
        if (!info?.config) return;
        els.statsPort.value = info.config.port;
        els.autoStart.checked = Boolean(info.config.autoStart);
        overlayManagerOpen = Boolean(info.config.overlayManagerOpen);
        overlays = (info.config.overlays || []).map((overlay) => ({
          id: overlay.id,
          template: overlay.template || "",
          rendered: ""
        }));
        renderOverlayList();
        applyServerInfo(info);
      })
      .catch(() => {
        els.serverStatus.textContent = t("server.configReadError");
        setServerStatusError(true);
      });
  }

  function applyServerInfo(info) {
    if (!info) return;
    state.serverInfo = info;
    serverRunning = Boolean(info.running);
    els.serverStart.textContent = serverRunning
      ? t("overlayManager.stop")
      : t("overlayManager.start");

    if (info.error) {
      els.serverStatus.textContent = t("server.error", { error: info.error });
      setServerStatusError(true);
    } else if (serverRunning) {
      els.serverStatus.textContent = t("server.running");
      setServerStatusError(false);
    } else {
      els.serverStatus.textContent = t("server.stopped");
      setServerStatusError(false);
    }

    els.overlayList.querySelectorAll(".overlay-url").forEach((element, index) => {
      if (!overlays[index]) return;
      const url = overlayUrl(overlays[index].id);
      element.dataset.url = url;
      element.textContent = url;
    });
  }

  function setServerStatusError(isError) {
    els.serverStatus.classList.toggle("server-status-error", isError);
  }

  function persistConfig() {
    clearTimeout(configSaveTimer);
    if (!window.statsServer) return Promise.resolve();

    const config = {
      port: Number(els.statsPort.value),
      autoStart: els.autoStart.checked,
      overlayManagerOpen,
      language: state.language,
      overlays: overlays.map((overlay) => ({
        id: overlay.id,
        template: overlay.template
      }))
    };

    return window.statsServer
      .configSet(config)
      .then(applyServerInfo)
      .catch(() => {
        els.serverStatus.textContent = t("server.saveError");
        setServerStatusError(true);
      });
  }

  function scheduleConfigSave() {
    clearTimeout(configSaveTimer);
    configSaveTimer = setTimeout(persistConfig, 400);
  }

  function toggleServer() {
    if (!window.statsServer) return;
    const action = serverRunning
      ? window.statsServer.serverStop()
      : window.statsServer.serverStart();
    action.then(applyServerInfo).catch(() => {
      els.serverStatus.textContent = t("server.controlError");
      setServerStatusError(true);
    });
  }

  function openDatePicker(event) {
    if (event.target === els.startDate) return;
    els.startDate.focus();
    if (typeof els.startDate.showPicker === "function") {
      els.startDate.showPicker();
    }
  }

  async function chooseNativeFile() {
    if (window.statsServer?.pickLogFile) {
      await chooseElectronFile();
      return;
    }
    if (!window.showOpenFilePicker) {
      openFallbackPicker();
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "PoE Client log", accept: { "text/plain": [".txt", ".log"] } }]
      });
      const file = await handle.getFile();
      if (!isClientLog(file)) {
        els.watchStatus.textContent = t("watch.selectLog");
        return;
      }
      await saveHandle(handle);
      await loadFile(file, handle, true);
    } catch (error) {
      if (isPickerCancel(error)) return;
      openFallbackPicker();
    }
  }

  async function chooseElectronFile() {
    let picked = null;
    try {
      picked = await window.statsServer.pickLogFile();
    } catch {
      return;
    }
    if (!picked || !picked.path) return;
    const file = new RemoteClientFile(picked.path);
    try {
      await file.getFile();
    } catch {
      els.watchStatus.textContent = t("watch.selectLog");
      return;
    }
    if (!isClientLog(file)) {
      els.watchStatus.textContent = t("watch.selectLog");
      return;
    }
    await deleteHandle();
    state.filePath = picked.path;
    await loadFile(file, file, true);
  }

  async function chooseFallbackFile(event) {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    if (!isClientLog(file)) {
      els.watchStatus.textContent = t("watch.selectLog");
      return;
    }
    await deleteHandle();
    await loadFile(file, null, true);
    els.watchStatus.textContent = t("watch.fileLoaded");
  }

  function openFallbackPicker() {
    els.watchStatus.textContent = t("watch.chooseLog");
    els.fallbackPicker.click();
  }

  async function restoreSavedState() {
    const saved = readLocalState();
    const savedLastSize = saved?.lastSize || 0;
    const needsMigrationScan = Boolean(saved && saved.version !== STATE_VERSION);
    if (saved) {
      state.records = (saved.records || []).map(refreshClassification).filter((record) => !isHiddenRecord(record));
      state.deaths = Array.isArray(saved.deaths) ? saved.deaths : collectRecordDeaths(state.records);
      state.realtime = saved.realtime !== false;
      state.statsExpanded = Boolean(saved.statsExpanded);
      state.startDate = saved.startDate || DEFAULT_START_DATE;
      state.characterName = normalizeCharacterName(saved.characterName);
      state.records = state.records.filter((record) => isOnOrAfterStartDate(record.time));
      recalculateRunCounts();
      recalculateDurations();
      state.lastSize = savedLastSize;
      state.fileName = saved.fileName || "";
    }

    let handle = await readHandle();
    if (!handle && isElectron && state.filePath) {
      const candidate = new RemoteClientFile(state.filePath);
      try {
        await candidate.getFile();
        handle = candidate;
      } catch {
        state.filePath = "";
      }
    }
    if (!handle) return;

    state.fileHandle = handle;
    const permission = handle.requestPermission
      ? await handle.requestPermission({ mode: "read" })
      : await handle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      try {
        const file = await handle.getFile();
        await loadFile(file, handle, false);
        if (needsMigrationScan) {
          await fullScan();
        } else if (savedLastSize > 0 && file.size > savedLastSize) {
          state.lastSize = savedLastSize;
          await pollFile();
        }
        if (state.realtime) startPolling();
      } catch {
        state.fileHandle = null;
        await deleteHandle();
        els.watchStatus.textContent = t("watch.reopenLog");
      }
    } else {
      els.watchStatus.textContent = t("watch.allowAccess");
    }
  }

  async function loadFile(file, handle, scanNow) {
    state.generation += 1;
    const generation = state.generation;
    if (!handle) {
      stopPolling();
      state.realtime = false;
    }
    state.file = file;
    state.fileHandle = handle;
    state.fileName = file.name;
    state.lastSize = file.size;
    els.fileName.textContent = file.name;
    els.watchStatus.textContent =
      handle && state.realtime ? t("watch.realtimeEnabled") : t("watch.fileLoaded");

    if (scanNow) {
      await fullScan();
    } else {
      saveLocalState();
    }

    if (isStale(generation)) return;
    if (handle && state.realtime) startPolling();
    render();
  }

  async function rescanTail() {
    const generation = state.generation;
    const file = await currentFile();
    if (!file || isStale(generation)) return;

    setProgress(12, t("progress.readingRecent"));
    const start = Math.max(0, file.size - TAIL_BYTES);
    const text = await file.slice(start).text();
    if (isStale(generation)) return;
    const lines = text.split(/\r?\n/).slice(-TAIL_LINES);
    state.deaths = [];
    const parsed = parseLines(lines, { reset: true });
    state.records = parsed.records;
    state.pending = parsed.pending;
    recalculateDurations();
    recalculateRunCounts();
    state.lastSize = file.size;
    resetVisibleRows();
    setProgress(100, t("progress.lines", { count: lines.length.toLocaleString("en-US") }));
    saveLocalState();
    render();
  }

  async function fullScan() {
    const generation = state.generation;
    const previous = {
      records: state.records,
      pending: state.pending,
      deaths: state.deaths,
      lastSize: state.lastSize
    };

    try {
      const file = await currentFile();
      if (!file || isStale(generation)) return;

      state.records = [];
      state.pending = null;
      state.deaths = [];
      const scanStart = await findScanStartOffset(file);
      if (isStale(generation)) return;
      const scanSize = Math.max(1, file.size - scanStart);
      const reader = file.slice(scanStart).stream().getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let scanned = 0;
      let linesCount = 0;
      setProgress(0, scanStart ? t("progress.scanningFromDate") : t("progress.fullScan"));

      while (true) {
        const { value, done } = await reader.read();
        if (isStale(generation)) return;
        if (done) break;
        scanned += value.byteLength;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        linesCount += lines.length;
        const parsed = parseLines(lines, { reset: false });
        state.pending = parsed.pending;
        setProgress(Math.round((scanned / scanSize) * 100), t("progress.lines", { count: linesCount.toLocaleString("en-US") }));
      }

      if (buffer) parseLines([buffer], { reset: false });
      if (isStale(generation)) return;
      recalculateRunCounts();
      recalculateDurations();
      state.lastSize = file.size;
      resetVisibleRows();
      setProgress(100, t("progress.lines", { count: linesCount.toLocaleString("en-US") }));
      saveLocalState();
      render();
    } catch {
      if (isStale(generation)) return;
      state.records = previous.records;
      state.pending = previous.pending;
      state.deaths = previous.deaths;
      state.lastSize = previous.lastSize;
      setProgress(0, t("progress.refreshFailed"));
      els.watchStatus.textContent = t("watch.scanFailed");
      render();
    }
  }

  async function findScanStartOffset(file) {
    if (!state.startDate) return 0;

    let end = file.size;
    let carry = "";
    setProgress(0, t("progress.findingStart"));

    while (end > 0) {
      const start = Math.max(0, end - REVERSE_SCAN_CHUNK_BYTES);
      const text = await file.slice(start, end).text();
      const combined = text + carry;
      const lines = combined.split(/\r?\n/);
      carry = lines.shift() || "";

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const date = lineDate(lines[index]);
        if (date && date < state.startDate) return start;
      }

      end = start;
      setProgress(Math.round(((file.size - end) / file.size) * 100), t("progress.findingStart"));
    }

    return 0;
  }

  async function pollFile() {
    if (!state.realtime) return;
    const generation = state.generation;
    const file = await currentFile();
    if (!file || isStale(generation)) return;

    if (file.size < state.lastSize) {
      await rescanTail();
      return;
    }

    if (file.size === state.lastSize) {
      els.watchStatus.textContent = t("watch.waitingNewAreas");
      return;
    }

    const text = await file.slice(state.lastSize).text();
    if (isStale(generation)) return;
    const lines = text.split(/\r?\n/);
    parseLines(lines, { reset: false });
    recalculateRunCounts();
    recalculateDurations();
    state.lastSize = file.size;
    setProgress(100, t("progress.addedLines", { count: lines.length }));
    els.watchStatus.textContent = t("watch.updated");
    saveLocalState();
    render();
  }

  function parseLines(lines, options) {
    if (options.reset) {
      state.records = [];
      state.pending = null;
      state.deaths = [];
    }

    for (const line of lines) {
      if (!line) continue;
      const generated = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*Generating level (\d+) area "([^"]+)" with seed (\d+)/);
      if (generated) {
        if (!isOnOrAfterStartDate(parseTime(generated[1]))) {
          state.pending = null;
          continue;
        }
        finalizePending();
        state.pending = {
          id: `${generated[3]}:${generated[4]}:${generated[1]}`,
          instanceKey: instanceKey(generated[3], generated[4]),
          time: parseTime(generated[1]),
          level: Number(generated[2]),
          code: generated[3],
          seed: generated[4],
          name: humanizeCode(generated[3])
        };
        continue;
      }

      const death = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*\[INFO Client \d+]\s+: (.+) has been slain\.$/);
      if (death) {
        if (!isOnOrAfterStartDate(parseTime(death[1]))) continue;
        if (!isCharacterDeath(death[2])) continue;
        recordGlobalDeath(parseTime(death[1]));
        recordDeath(parseTime(death[1]));
        continue;
      }

      const scene = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*\[SCENE\] Set Source \[(.+)]/);
      if (scene) {
        if (!isOnOrAfterStartDate(parseTime(scene[1]))) continue;
        const name = scene[2].trim();
        if (!name || name === "(null)" || name === "(unknown)") continue;
        if (state.pending) {
          state.pending.name = name;
        } else if (name === "Atlas") {
          pushRecord({ id: `scene:${scene[1]}:${name}`, time: parseTime(scene[1]), name, level: "", code: "", seed: "" });
        }
        continue;
      }

      const loading = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*\[LOADING SCREEN\] \((.+)\) Duration = ([\d.]+)/);
      if (loading && state.pending) {
        if (!isOnOrAfterStartDate(parseTime(loading[1]))) continue;
        state.pending.name = loading[2].trim();
        state.pending.loadingDuration = Number(loading[3]);
        finalizePending();
      }
    }

    return { records: state.records, pending: state.pending };
  }

  function finalizePending() {
    if (!state.pending) return;
    pushRecord(state.pending);
    state.pending = null;
  }

  function pushRecord(raw) {
    const meta = classify(raw.name, raw.code);
    const record = { ...raw, ...meta };
    record.deaths = Array.isArray(record.deaths) ? record.deaths : [];
    record.instanceKey = record.instanceKey || instanceKey(record.code, record.seed);
    const last = state.records[state.records.length - 1];
    if (last && last.instanceKey && last.instanceKey === record.instanceKey) {
      mergeDeaths(last, record.deaths);
      return;
    }
    closePreviousRun(record);
    if (isHiddenRecord(record)) return;
    state.records.push(record);
  }

  function recordDeath(time) {
    const record = state.pending || lastTimedRecord();
    if (!record) return;
    record.deaths = Array.isArray(record.deaths) ? record.deaths : [];
    if (record.deaths.includes(time)) return;
    record.deaths.push(time);
  }

  function recordGlobalDeath(time) {
    if (state.deaths.includes(time)) return;
    state.deaths.push(time);
  }

  function mergeDeaths(record, deaths) {
    if (!Array.isArray(deaths) || !deaths.length) return;
    record.deaths = Array.isArray(record.deaths) ? record.deaths : [];
    for (const death of deaths) {
      if (!record.deaths.includes(death)) record.deaths.push(death);
    }
  }

  function lastTimedRecord() {
    for (let index = state.records.length - 1; index >= 0; index -= 1) {
      if (isTimedRun(state.records[index])) return state.records[index];
    }
    return null;
  }

  function closePreviousRun(nextRecord) {
    const previous = state.records[state.records.length - 1];
    if (!previous || !isTimedRun(previous)) return;
    if (previous.endTime) return;
    const durationMs = msBetween(previous.time, nextRecord.time);
    if (durationMs > 0) {
      previous.endTime = nextRecord.time;
      previous.durationMs = durationMs;
    }
  }

  function recalculateDurations() {
    for (const record of state.records) {
      delete record.durationMs;
    }

    for (let index = 0; index < state.records.length - 1; index += 1) {
      const record = state.records[index];
      if (!isTimedRun(record)) continue;
      const durationMs = msBetween(record.time, record.endTime || state.records[index + 1].time);
      if (durationMs > 0) record.durationMs = durationMs;
    }

    const last = state.records[state.records.length - 1];
    if (last?.endTime && isTimedRun(last)) {
      const durationMs = msBetween(last.time, last.endTime);
      if (durationMs > 0) last.durationMs = durationMs;
    }
  }

  function recalculateRunCounts() {
    const counts = new Map();
    for (const record of state.records) {
      if (isHiddenRecord(record)) {
        delete record.runCount;
        continue;
      }
      const key = locationKey(record);
      const nextCount = (counts.get(key) || 0) + 1;
      record.runCount = nextCount;
      counts.set(key, nextCount);
    }
  }

  function locationKey(record) {
    return normalize(record.name || record.code);
  }

  function isHiddenRecord(record) {
    return HIDDEN_TYPES.has(record.type) || isExcludedLocation(record);
  }

  function isExcludedLocation(record) {
    return Number(record.level) < 65 || locationKey(record) === "vaal ruins";
  }

  function instanceKey(code, seed) {
    return code && seed ? `${code}:${seed}` : "";
  }

  function isTimedRun(record) {
    return record.type === "map" || record.type === "anomaly" || record.type === "citadel" || record.type === "expedition" || record.type === "boss" || record.type === "special";
  }

  function classify(name, code) {
    const found = wikiByName.get(normalize(name));
    if (found) return { type: found.type, biome: found.biome, boss: found.boss, known: true };

    const codeMatch = matchByCode(code);
    if (codeMatch) return { type: codeMatch.type, biome: codeMatch.biome, boss: codeMatch.boss, known: true };

    const hint = matchHint(name, code);
    if (hint) return { type: hint[1], biome: "", boss: "", known: false };
    if (name === "Atlas") return { type: "town", biome: "", boss: "", known: true };
    if (/town|encampment|caravan|ziggurat/i.test(name)) return { type: "town", biome: "", boss: "", known: false };
    return { type: "map", biome: "", boss: "", known: false };
  }

  function refreshClassification(record) {
    const meta = classify(record.name, record.code);
    return { ...record, ...meta, deaths: Array.isArray(record.deaths) ? record.deaths : [], instanceKey: record.instanceKey || instanceKey(record.code, record.seed) };
  }

  async function currentFile() {
    if (state.fileHandle) {
      const permission = await state.fileHandle.requestPermission({ mode: "read" });
      if (permission !== "granted") {
        els.watchStatus.textContent = t("watch.noAccess");
        return null;
      }
      state.file = await state.fileHandle.getFile();
      return state.file;
    }
    return state.file;
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => pollFile().catch(() => {
      els.watchStatus.textContent = t("watch.waitingAccess");
    }), POLL_MS);
  }

  function stopPolling() {
    if (!state.pollTimer) return;
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  function toggleRealtime() {
    state.realtime = !state.realtime;
    if (state.realtime && state.fileHandle) {
      startPolling();
      pollFile();
    } else {
      stopPolling();
      els.watchStatus.textContent = state.fileHandle
        ? t("watch.realtimeDisabled")
        : t("watch.noFile");
    }
    saveLocalState();
    renderRealtimeToggle();
  }

  function toggleStats() {
    state.statsExpanded = !state.statsExpanded;
    saveLocalState();
    renderStatsState();
  }

  async function clearData() {
    state.generation += 1;
    stopPolling();
    state.fileHandle = null;
    state.file = null;
    state.fileName = "";
    state.filePath = "";
    state.lastSize = 0;
    state.pending = null;
    state.records = [];
    state.deaths = [];
    resetVisibleRows();
    state.startDate = DEFAULT_START_DATE;
    state.characterName = "";
    els.startDate.value = DEFAULT_START_DATE;
    els.characterName.value = "";
    localStorage.removeItem("poe2-map-tracker-state");
    await deleteHandle();
    setProgress(0, t("progress.lines", { count: 0 }));
    els.watchStatus.textContent = t("watch.cleared");
    render();
  }

  function isStale(generation) {
    return generation !== state.generation;
  }

  function render() {
    const hasLog = Boolean(state.fileName || state.file || state.fileHandle);
    els.fileName.textContent = state.fileName || t("controls.noLog");
    if (!hasLog) els.watchStatus.textContent = t("watch.noFile");
    els.setupGuide.hidden = hasLog;
    els.summaryGrid.hidden = !hasLog;
    const showOverlayToggle = hasLog && Boolean(window.statsServer);
    applyOverlayManagerState(showOverlayToggle);
    els.statsBand.hidden = !hasLog;
    els.workspace.hidden = !hasLog;
    els.controlBand.classList.toggle("setup-mode", !hasLog);
    els.afterLoad.forEach((item) => {
      item.hidden = !hasLog;
    });
    els.nativePicker.hidden = hasLog;
    els.fallbackControl.hidden = hasLog;
    els.startDate.value = state.startDate;
    if (document.activeElement !== els.characterName) {
      els.characterName.value = state.characterName;
    }
    renderRealtimeToggle();
    renderStatsState();
    renderSummary();
    renderLocationStats();
    renderOverlays();
    renderTable();
    if (state.serverInfo) applyServerInfo(state.serverInfo);
  }

  function renderSummary() {
    const maps = state.records.filter((record) => record.type === "map");
    const anomalies = state.records.filter((record) => record.type === "anomaly");
    const citadels = state.records.filter((record) => record.type === "citadel");
    const expeditions = state.records.filter((record) => record.type === "expedition");
    const bosses = state.records.filter((record) => record.type === "boss" || record.type === "special");
    els.mapCount.textContent = maps.length;
    els.anomalyCount.textContent = anomalies.length;
    els.citadelCount.textContent = citadels.length;
    els.expeditionCount.textContent = expeditions.length;
    els.bossCount.textContent = bosses.length;
    els.deathCount.textContent = state.deaths.length;
    const lastVisible = state.records.filter((record) => !isHiddenRecord(record)).at(-1);
    els.lastArea.textContent = lastVisible ? lastVisible.name : "-";
  }

  function renderLocationStats() {
    const stats = new Map();
    state.locations = new Map();
    for (const record of state.records) {
      if (isHiddenRecord(record)) continue;
      const keyName = record.name;
      const keyNormalized = normalize(keyName);
      const key = `${keyNormalized}:${record.type}`;
      const current = stats.get(key) || {
        name: keyName,
        type: record.type,
        count: 0,
        deaths: 0,
        totalMs: 0,
        timedCount: 0,
        lastTime: ""
      };
      current.count += 1;
      current.deaths += deathCount(record);
      current.lastTime = record.time;
      if (isTimedRun(record) && record.durationMs) {
        current.totalMs += record.durationMs;
        current.timedCount += 1;
      }
      stats.set(key, current);
      state.locations.set(keyNormalized, current);
    }

    const rows = Array.from(stats.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    if (!rows.length) {
      els.locationStats.innerHTML = `<p class="empty-stat">${escapeHtml(t("stats.empty"))}</p>`;
      return;
    }

    els.locationStats.innerHTML = rows.map((item) => {
      const averageMs = item.timedCount ? item.totalMs / item.timedCount : 0;
      const selected = isSelectedLocation(item) ? " selected" : "";
      return `
        <article class="stat-row${selected}" role="button" tabindex="0" data-location-name="${escapeHtml(item.name)}" data-location-type="${escapeHtml(item.type)}">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span class="type type-${item.type}">${typeLabel(item.type)}</span>
          </div>
          <div class="stat-metrics">
            <b>${item.count}</b>
            <small>${statDetailLabel(item, averageMs)}</small>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTable() {
    const query = state.search;
    const allRows = state.records
      .filter((record) => !isHiddenRecord(record))
      .filter((record) => state.activeFilter === "all" || record.type === state.activeFilter)
      .filter((record) => !state.locationFilter || (locationKey(record) === state.locationFilter.key && record.type === state.locationFilter.type))
      .filter((record) => !query || normalizeSearch(`${record.name} ${record.code} ${record.boss}`).includes(query))
      .slice()
      .reverse();
    const rows = allRows.slice(0, state.visibleRows);

    if (!rows.length) {
      els.historyBody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(t("table.noMatches"))}</td></tr>`;
      return;
    }

    els.historyBody.innerHTML = rows.map((record) => `
      <tr>
        <td>${escapeHtml(formatTime(record.time))}</td>
        <td>
          <strong>${escapeHtml(record.name)}</strong>
          ${record.boss ? `<small>${escapeHtml(record.boss)}</small>` : ""}
        </td>
        <td><span class="type type-${record.type}">${typeLabel(record.type)}</span></td>
        <td>${escapeHtml(String(record.runCount || ""))}</td>
        <td>${escapeHtml(runDurationLabel(record))}</td>
        <td>${deathCell(record)}</td>
        <td>${escapeHtml(String(record.level || ""))}</td>
      </tr>
    `).join("") + loadMoreRow(rows.length, allRows.length);
  }

  function handleTableScroll() {
    if (!els.historyBody.querySelector(".load-more")) return;
    const nearBottom = els.tableWrap.scrollTop + els.tableWrap.clientHeight >= els.tableWrap.scrollHeight - 120;
    if (!nearBottom) return;
    const previousVisibleRows = state.visibleRows;
    state.visibleRows += HISTORY_PAGE_SIZE;
    if (state.visibleRows !== previousVisibleRows) renderTable();
  }

  function resetVisibleRows() {
    state.visibleRows = HISTORY_PAGE_SIZE;
    if (els.tableWrap) els.tableWrap.scrollTop = 0;
  }

  function applyLocationFilter(name, type) {
    if (!name || !type) return;
    const key = normalize(name);
    if (state.locationFilter?.key === key && state.locationFilter.type === type) {
      clearLocationFilter();
      return;
    }
    state.locationFilter = { key, type };
    state.search = normalizeSearch(name);
    state.activeFilter = type;
    els.searchBox.value = name;
    syncFilterButtons();
    resetVisibleRows();
    renderLocationStats();
    renderOverlays();
    renderTable();
  }

  function clearLocationFilter() {
    state.locationFilter = null;
    state.search = "";
    state.activeFilter = "all";
    els.searchBox.value = "";
    syncFilterButtons();
    resetVisibleRows();
    renderLocationStats();
    renderOverlays();
    renderTable();
  }

  function isSelectedLocation(item) {
    return Boolean(state.locationFilter && state.locationFilter.key === normalize(item.name) && state.locationFilter.type === item.type);
  }

  function syncFilterButtons() {
    els.filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.activeFilter));
  }

  function loadMoreRow(visibleCount, totalCount) {
    if (visibleCount >= totalCount) return "";
    return `<tr><td colspan="7" class="load-more">${escapeHtml(
      t("table.loadMore", { visible: visibleCount, total: totalCount })
    )}</td></tr>`;
  }

  function setProgress(percent, label) {
    els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.scanMeta.textContent = label;
  }

  function renderRealtimeToggle() {
    if (!state.fileHandle) {
      els.realtimeToggle.textContent = t("controls.realtimeUnavailable");
      els.realtimeToggle.setAttribute("aria-pressed", "false");
      els.realtimeToggle.classList.remove("active-toggle");
      els.realtimeToggle.disabled = true;
      return;
    }
    els.realtimeToggle.disabled = false;
    els.realtimeToggle.textContent = state.realtime
      ? t("controls.realtimeOn")
      : t("controls.realtimeOff");
    els.realtimeToggle.setAttribute("aria-pressed", String(state.realtime));
    els.realtimeToggle.classList.toggle("active-toggle", state.realtime);
  }

  function isClientLog(file) {
    return file && file.name === REQUIRED_LOG_FILE;
  }

  function isPickerCancel(error) {
    return error && error.name === "AbortError";
  }

  function renderStatsState() {
    els.statsBand.classList.toggle("expanded", state.statsExpanded);
    els.statsHeader.setAttribute("aria-expanded", String(state.statsExpanded));
    els.statsHint.textContent = state.statsExpanded
      ? t("stats.collapseHint")
      : t("stats.expandHint");
  }

  function typeLabel(type) {
    const key = `type.${type}`;
    const label = t(key);
    return label === key ? t("type.area") : label;
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/^the /, "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearch(value) {
    return String(value || "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  function normalizeCharacterName(value) {
    return String(value || "").trim();
  }

  function isCharacterDeath(name) {
    if (!state.characterName) return true;
    return normalizeCharacterName(name).toLocaleLowerCase() === state.characterName.toLocaleLowerCase();
  }

  function normalizeCodeName(value) {
    return String(value || "")
      .replace(/^Map/i, "")
      .replace(/^The\s+/i, "")
      .replace(/[^a-z0-9]+/gi, "")
      .toLowerCase();
  }

  function matchByCode(code) {
    if (!code) return null;
    const candidates = codeCandidates(code);
    for (const candidate of candidates) {
      const found = wikiByCodeName.get(candidate);
      if (found) return found;
    }
    return wikiRows.find((row) => candidates.some((candidate) => candidate.includes(row.codeKey) || row.codeKey.includes(candidate))) || null;
  }

  function codeCandidates(code) {
    const raw = String(code || "");
    const parts = raw.split(/[_/\\-]+/).filter(Boolean);
    const candidates = new Set([normalizeCodeName(raw)]);
    for (const part of parts) {
      candidates.add(normalizeCodeName(part));
    }
    candidates.add(normalizeCodeName(raw.replace(/Act\d+/gi, "")));
    candidates.add(normalizeCodeName(raw.replace(/Map/gi, "")));
    return Array.from(candidates).filter(Boolean);
  }

  function matchHint(name, code) {
    const raw = `${code || ""} ${name || ""}`.toLowerCase();
    return window.POE2_LOCATION_DATA.internalHints.find(([needle]) => raw.includes(String(needle).toLowerCase()));
  }

  function humanizeCode(code) {
    return String(code || "")
      .replace(/^Map/, "")
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim() || t("area.unknown");
  }

  function parseTime(value) {
    return value.replace(/\//g, "-");
  }

  function lineDate(line) {
    const match = String(line || "").match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  }

  function isOnOrAfterStartDate(value) {
    if (!state.startDate) return true;
    return value.slice(0, 10) >= state.startDate;
  }

  function formatTime(value) {
    return value ? value.replace("T", " ") : "";
  }

  function runDurationLabel(record) {
    if (!isTimedRun(record)) return "";
    return record.durationMs ? formatDuration(record.durationMs) : t("table.running");
  }

  function deathCell(record) {
    const deaths = deathCount(record);
    if (!deaths) return "";
    return `<strong class="death-count">${deaths}</strong>`;
  }

  function deathCount(record) {
    return Array.isArray(record.deaths) ? record.deaths.length : 0;
  }

  function totalDeaths(records) {
    return records.reduce((total, record) => total + deathCount(record), 0);
  }

  function collectRecordDeaths(records) {
    return Array.from(new Set(records.flatMap((record) => Array.isArray(record.deaths) ? record.deaths : [])));
  }

  function statDetailLabel(item, averageMs) {
    const parts = [];
    if (averageMs) parts.push(t("stats.avg", { duration: formatDuration(averageMs) }));
    if (item.deaths) parts.push(t("stats.deaths", { count: item.deaths }));
    return parts.join(" / ") || t("stats.noTime");
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  function msBetween(start, end) {
    const startMs = Date.parse(start.replace(" ", "T"));
    const endMs = Date.parse(end.replace(" ", "T"));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
    return endMs - startMs;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function saveLocalState() {
    localStorage.setItem("poe2-map-tracker-state", JSON.stringify({
      version: STATE_VERSION,
      records: state.records,
      deaths: state.deaths,
      lastSize: state.lastSize,
      fileName: state.fileName,
      filePath: state.filePath,
      realtime: state.realtime,
      statsExpanded: state.statsExpanded,
      startDate: state.startDate,
      characterName: state.characterName,
      savedAt: Date.now()
    }));
  }

  function readLocalState() {
    try {
      return JSON.parse(localStorage.getItem("poe2-map-tracker-state") || "null");
    } catch {
      return null;
    }
  }

  async function db() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(handle) {
    const database = await db();
    const tx = database.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, "fileHandle");
    await completeTransaction(tx);
    database.close();
  }

  async function readHandle() {
    const database = await db();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get("fileHandle");
      request.onsuccess = () => {
        database.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        database.close();
        resolve(null);
      };
    });
  }

  async function deleteHandle() {
    const database = await db();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        database.close();
        resolve();
      };
      tx.onerror = () => {
        database.close();
        resolve();
      };
      tx.onabort = () => {
        database.close();
        resolve();
      };
    });
  }

  function completeTransaction(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
})();
