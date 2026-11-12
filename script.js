/* ============================================================
   Placement Assistant (Gen AI Internship) — Frontend logic
   ------------------------------------------------------------
   No <form> elements, no full-page reloads. Every request uses
   a relative path ("/api/chat") so the frontend and backend
   never fall out of sync on ports.
   ============================================================ */

const chatBox        = document.getElementById("chatBox");
const userInput       = document.getElementById("userInput");
const sendBtn         = document.getElementById("sendBtn");
const stopBtn         = document.getElementById("stopBtn");
const companySelect   = document.getElementById("companySelect");
const courseSelect    = document.getElementById("courseSelect");
const modeButtons     = document.querySelectorAll(".mode-item");
const modeTitle       = document.getElementById("modeTitle");
const downloadBtn     = document.getElementById("downloadBtn");
const newChatBtn      = document.getElementById("newChatBtn");
const statusDot       = document.getElementById("statusDot");
const statusText      = document.getElementById("statusText");
const sidebar         = document.getElementById("sidebar");
const sidebarOpen     = document.getElementById("sidebarOpen");
const sidebarClose    = document.getElementById("sidebarClose");
const sidebarOverlay  = document.getElementById("sidebarOverlay");
const collapseBtn     = document.getElementById("collapseBtn");
const appEl           = document.getElementById("app");
const fileChips       = document.getElementById("fileChips");
const attachBtn       = document.getElementById("attachBtn");
const attachMenu      = document.getElementById("attachMenu");
const resumeInput     = document.getElementById("resumeInput");
const cameraInput     = document.getElementById("cameraInput");
const pdfInput        = document.getElementById("pdfInput");
const imageInput      = document.getElementById("imageInput");
const documentInput   = document.getElementById("documentInput");
const multiInput      = document.getElementById("multiInput");
const composerInner   = document.getElementById("composerInner");
const historyList     = document.getElementById("historyList");
const historySearch   = document.getElementById("historySearch");
const toastHost       = document.getElementById("toastHost");
const settingsBtn     = document.getElementById("settingsBtn");
const settingsPanel   = document.getElementById("settingsPanel");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose   = document.getElementById("settingsClose");
const themeToggle     = document.getElementById("themeToggle");
const accentSwatches  = document.getElementById("accentSwatches");
const fontSizeToggle  = document.getElementById("fontSizeToggle");
const exportChatsBtn  = document.getElementById("exportChatsBtn");
const importChatsInput = document.getElementById("importChatsInput");
const clearHistoryBtn  = document.getElementById("clearHistoryBtn");

let currentMode = "ask";
let attachedFiles = []; // [{id, name, type}] confirmed on the server for this session

const MODE_LABELS = {
    ask: "Ask Question",
    rolefit: "Role Fit",
    mock: "Mock Test",
    resume: "Resume Review",
    pdf: "Preparation Plan"
};

marked.setOptions({ breaks: true, gfm: true });

/* ------------------------------------------------------------
   Session id — identifies this browser to the backend so
   uploaded PDFs/images stay attached to the right person
   without needing a login.
------------------------------------------------------------ */

function getSessionId() {
    let id = localStorage.getItem("model_session_id");
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
        localStorage.setItem("model_session_id", id);
    }
    return id;
}
const SESSION_ID = getSessionId();

function authHeaders(extra = {}) {
    return { "X-Session-Id": SESSION_ID, ...extra };
}

/* ------------------------------------------------------------
   Settings: theme, accent color, font size — persisted and
   applied via <html data-*> attributes so CSS does the rest.
------------------------------------------------------------ */

const SETTINGS_KEY = "model_settings";

function loadSettings() {
    try {
        return { theme: "light", accent: "indigo", fontSize: "md", ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
    } catch {
        return { theme: "light", accent: "indigo", fontSize: "md" };
    }
}

let settings = loadSettings();

function applySettings() {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.documentElement.setAttribute("data-accent", settings.accent);
    document.documentElement.setAttribute("data-font-size", settings.fontSize);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    themeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.value === settings.theme));
    accentSwatches.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.value === settings.accent));
    fontSizeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.value === settings.fontSize));
}

themeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    settings.theme = btn.dataset.value;
    applySettings();
});
accentSwatches.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    settings.accent = btn.dataset.value;
    applySettings();
});
fontSizeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    settings.fontSize = btn.dataset.value;
    applySettings();
});

function openSettings() {
    settingsPanel.hidden = false;
    settingsOverlay.hidden = false;
    requestAnimationFrame(() => { settingsPanel.classList.add("open"); settingsOverlay.classList.add("show"); });
}
function closeSettings() {
    settingsPanel.classList.remove("open");
    settingsOverlay.classList.remove("show");
    setTimeout(() => { settingsPanel.hidden = true; settingsOverlay.hidden = true; }, 200);
}
settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", closeSettings);

exportChatsBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(chats, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "placement-assistant-chats.json";
    a.click();
    URL.revokeObjectURL(url);
});

importChatsInput.addEventListener("change", async () => {
    const file = importChatsInput.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error("Invalid file format");
        const existingIds = new Set(chats.map((c) => c.id));
        const merged = imported.filter((c) => c && c.id && !existingIds.has(c.id));
        chats = [...merged, ...chats];
        saveAllChats(chats);
        renderHistoryList();
        toast(merged.length + " chat(s) imported");
    } catch (err) {
        toast("Could not import that file: " + err.message, true);
    }
    importChatsInput.value = "";
});

clearHistoryBtn.addEventListener("click", () => {
    if (!confirm("Delete all saved chats? This cannot be undone.")) return;
    chats = [];
    saveAllChats(chats);
    startNewChat();
    toast("Chat history cleared");
});

/* ------------------------------------------------------------
   Sidebar collapse (desktop) — persisted
------------------------------------------------------------ */

const COLLAPSE_KEY = "model_sidebar_collapsed";

function applyCollapsed() {
    const collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
    appEl.classList.toggle("sidebar-collapsed", collapsed);
}
collapseBtn.addEventListener("click", () => {
    const collapsed = appEl.classList.toggle("sidebar-collapsed");
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
});
applyCollapsed();
applySettings();

/* ------------------------------------------------------------
   Chat history storage (localStorage)
------------------------------------------------------------ */

const HISTORY_KEY = "model_chat_history";

function loadAllChats() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
        return [];
    }
}

function saveAllChats(chats) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
}

let chats = loadAllChats();
let activeChatId = null;
let activeMessages = []; // [{role: "user"|"assistant", content, ts}]

function createNewChatRecord() {
    const chat = {
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        title: "New chat",
        mode: currentMode,
        company: companySelect.value,
        course: courseSelect.value,
        messages: [],
        createdAt: Date.now()
    };
    chats.unshift(chat);
    saveAllChats(chats);
    return chat;
}

function persistActiveChat() {
    if (!activeChatId) return;
    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) return;
    chat.messages = activeMessages;
    chat.mode = currentMode;
    chat.company = companySelect.value;
    chat.course = courseSelect.value;
    if (chat.title === "New chat") {
        const firstUser = activeMessages.find((m) => m.role === "user");
        if (firstUser) chat.title = firstUser.content.slice(0, 48) + (firstUser.content.length > 48 ? "…" : "");
    }
    saveAllChats(chats);
    renderHistoryList();
}

function renderHistoryList() {
    historyList.innerHTML = "";
    const query = (historySearch.value || "").trim().toLowerCase();

    const sorted = [...chats].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    const visible = query ? sorted.filter((c) => c.title.toLowerCase().includes(query)) : sorted;

    visible.forEach((chat) => {
        const row = document.createElement("div");
        row.className = "history-item" + (chat.id === activeChatId ? " active" : "") + (chat.pinned ? " pinned" : "");

        const titleSpan = document.createElement("span");
        titleSpan.className = "history-title";
        titleSpan.textContent = chat.title;
        titleSpan.title = chat.title;
        titleSpan.addEventListener("click", () => loadChat(chat.id));

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "history-icon-btn" + (chat.pinned ? " active" : "");
        pinBtn.title = chat.pinned ? "Unpin" : "Pin";
        pinBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16 3v6l2 3v2h-6v6l-1 1-1-1v-6H4v-2l2-3V3z"/></svg>';
        pinBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            chat.pinned = !chat.pinned;
            saveAllChats(chats);
            renderHistoryList();
        });

        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "history-icon-btn";
        renameBtn.title = "Rename";
        renameBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0L14.96 5.17l3.75 3.75z"/></svg>';
        renameBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const next = prompt("Rename chat", chat.title);
            if (next && next.trim()) {
                chat.title = next.trim().slice(0, 60);
                saveAllChats(chats);
                renderHistoryList();
            }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "history-icon-btn";
        deleteBtn.title = "Delete";
        deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 7h12l-1 14H7zm3-4h6l1 2H8zM5 5h14v2H5z"/></svg>';
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            chats = chats.filter((c) => c.id !== chat.id);
            saveAllChats(chats);
            if (chat.id === activeChatId) startNewChat();
            else renderHistoryList();
        });

        actions.appendChild(pinBtn);
        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        row.appendChild(titleSpan);
        row.appendChild(actions);
        historyList.appendChild(row);
    });

    if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = query ? "No chats match your search." : "No chats yet.";
        historyList.appendChild(empty);
    }
}

historySearch.addEventListener("input", renderHistoryList);

function loadChat(chatId) {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    activeChatId = chat.id;
    activeMessages = chat.messages || [];
    currentMode = chat.mode || "ask";
    modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === currentMode));
    modeTitle.textContent = MODE_LABELS[currentMode] || "Ask Question";
    companySelect.value = chat.company || "";
    courseSelect.value = chat.course || "";

    chatBox.innerHTML = "";
    if (activeMessages.length === 0) {
        showEmptyState();
    } else {
        activeMessages.forEach((m) => renderMessage(m.content, m.role === "assistant" ? "ai" : "user", { skipStore: true, ts: m.ts }));
    }

    clearAttachedFilesUI();
    renderHistoryList();
    closeSidebarOnMobile();
}

function startNewChat() {
    chatBox.innerHTML = "";
    showEmptyState();
    activeChatId = null;
    activeMessages = [];
    clearAttachedFilesUI();

    fetch("/api/clear-context", { method: "POST", headers: authHeaders() }).catch(() => {});
    renderHistoryList();
    closeSidebarOnMobile();
}

/* ------------------------------------------------------------
   Mode switching
------------------------------------------------------------ */

modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        modeButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        currentMode = button.dataset.mode;
        modeTitle.textContent = MODE_LABELS[currentMode] || "Ask Question";
        closeSidebarOnMobile();
    });
});

/* ------------------------------------------------------------
   Mobile sidebar toggle
------------------------------------------------------------ */

function openSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");
}
function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
}
function closeSidebarOnMobile() {
    if (window.innerWidth <= 860) closeSidebar();
}

sidebarOpen?.addEventListener("click", openSidebar);
sidebarClose?.addEventListener("click", closeSidebar);
sidebarOverlay?.addEventListener("click", closeSidebar);

/* ------------------------------------------------------------
   Populate dropdowns from data.js
------------------------------------------------------------ */

for (const company in COMPANIES) {
    const option = document.createElement("option");
    option.value = company;
    option.textContent = company;
    companySelect.appendChild(option);
}
COURSES.forEach((course) => {
    const option = document.createElement("option");
    option.value = course;
    option.textContent = course;
    courseSelect.appendChild(option);
});

/* ------------------------------------------------------------
   Toasts
------------------------------------------------------------ */

function toast(message, isError = false) {
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " toast-error" : "");
    el.textContent = message;
    toastHost.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 200);
    }, 3200);
}

/* ------------------------------------------------------------
   Chat rendering
------------------------------------------------------------ */

function clearEmptyState() {
    const empty = chatBox.querySelector(".empty-state");
    if (empty) empty.remove();
}

function showEmptyState() {
    chatBox.innerHTML = `
        <div class="empty-state">
            <h2>Welcome to Placement Assistant</h2>
            <p>
                Select a company and course, pick a mode, then start asking
                questions. Attach PDFs or images with the + button, or just
                drag and drop them onto this window.
            </p>
        </div>
    `;
}

function renderCodeBlocks(container) {
    container.querySelectorAll("pre code").forEach((codeEl) => {
        if (window.hljs) hljs.highlightElement(codeEl);

        const pre = codeEl.parentElement;
        if (pre.parentElement.classList.contains("code-block-wrap")) return;

        const lang = (codeEl.className.match(/language-(\w+)/) || [, "text"])[1];

        const wrap = document.createElement("div");
        wrap.className = "code-block-wrap";
        pre.parentNode.insertBefore(wrap, pre);

        const header = document.createElement("div");
        header.className = "code-block-header";
        header.innerHTML = `<span>${lang}</span>`;

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "code-copy-btn";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(codeEl.textContent).then(() => {
                copyBtn.textContent = "Copied";
                setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
            });
        });

        header.appendChild(copyBtn);
        wrap.appendChild(header);
        wrap.appendChild(pre);
    });
}

function addMessageActions(bubble, message, sender, ts) {
    const wrap = document.createElement("div");
    wrap.className = "message-actions-wrap";

    if (ts) {
        const time = document.createElement("span");
        time.className = "message-time";
        time.textContent = formatTime(ts);
        wrap.appendChild(time);
    }

    const bar = document.createElement("div");
    bar.className = "message-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(message).then(() => toast("Copied to clipboard"));
    });
    bar.appendChild(copyBtn);

    if (sender === "ai") {
        const pdfBtn = document.createElement("button");
        pdfBtn.type = "button";
        pdfBtn.textContent = "Download PDF";
        pdfBtn.addEventListener("click", () => downloadAsPdf(message));
        bar.appendChild(pdfBtn);

        const regenBtn = document.createElement("button");
        regenBtn.type = "button";
        regenBtn.textContent = "Regenerate";
        regenBtn.addEventListener("click", () => regenerateLast());
        bar.appendChild(regenBtn);

        const likeBtn = document.createElement("button");
        likeBtn.type = "button";
        likeBtn.className = "feedback-btn";
        likeBtn.title = "Good response";
        likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M2 21h2a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H2zm19.83-9.29a1 1 0 0 0-.83-.71H16l.71-3.53.02-.22a1.5 1.5 0 0 0-.44-1.06L15.17 5 8.59 11.59A2 2 0 0 0 8 13v6a2 2 0 0 0 2 2h7a2 2 0 0 0 1.84-1.21l2.92-6.82c.1-.24.15-.5.15-.76v-1.3z"/></svg>';
        const dislikeBtn = document.createElement("button");
        dislikeBtn.type = "button";
        dislikeBtn.className = "feedback-btn";
        dislikeBtn.title = "Bad response";
        dislikeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(180deg)"><path fill="currentColor" d="M2 21h2a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H2zm19.83-9.29a1 1 0 0 0-.83-.71H16l.71-3.53.02-.22a1.5 1.5 0 0 0-.44-1.06L15.17 5 8.59 11.59A2 2 0 0 0 8 13v6a2 2 0 0 0 2 2h7a2 2 0 0 0 1.84-1.21l2.92-6.82c.1-.24.15-.5.15-.76v-1.3z"/></svg>';
        likeBtn.addEventListener("click", () => {
            const nowActive = !likeBtn.classList.contains("active");
            likeBtn.classList.toggle("active", nowActive);
            dislikeBtn.classList.remove("active");
            if (nowActive) toast("Thanks for the feedback");
        });
        dislikeBtn.addEventListener("click", () => {
            const nowActive = !dislikeBtn.classList.contains("active");
            dislikeBtn.classList.toggle("active", nowActive);
            likeBtn.classList.remove("active");
            if (nowActive) toast("Thanks for the feedback");
        });
        bar.appendChild(likeBtn);
        bar.appendChild(dislikeBtn);
    }

    wrap.appendChild(bar);
    return wrap;
}

function formatTime(ts) {
    try {
        return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function renderMessage(text, sender, opts = {}) {
    clearEmptyState();

    const message = document.createElement("div");
    message.className = "message " + sender;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = sender === "ai" ? "P" : "";
    avatar.style.display = sender === "ai" ? "flex" : "none";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (sender === "ai") {
        bubble.innerHTML = marked.parse(text);
        renderCodeBlocks(bubble);
    } else if (sender === "system") {
        bubble.textContent = text;
    } else {
        bubble.textContent = text;
    }

    if (sender === "ai") message.appendChild(avatar);
    message.appendChild(bubble);

    const ts = opts.ts || Date.now();
    if ((sender === "ai" || sender === "user") && !opts.noActions) {
        message.appendChild(addMessageActions(bubble, text, sender, ts));
    }

    chatBox.appendChild(message);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (!opts.skipStore && (sender === "ai" || sender === "user")) {
        activeMessages.push({ role: sender === "ai" ? "assistant" : "user", content: text, ts });
        if (!activeChatId) {
            const chat = createNewChatRecord();
            activeChatId = chat.id;
        }
        persistActiveChat();
    }

    return { message, bubble };
}

function renderImageMessage(dataUrl, prompt) {
    clearEmptyState();
    const message = document.createElement("div");
    message.className = "message ai";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "P";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = prompt;
    img.className = "generated-image";
    bubble.appendChild(img);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.textContent = "Download Image";
    dlBtn.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "generated-image.png";
        a.click();
    });
    actions.appendChild(dlBtn);

    message.appendChild(avatar);
    message.appendChild(bubble);
    message.appendChild(actions);
    chatBox.appendChild(message);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addTypingIndicator() {
    clearEmptyState();
    const message = document.createElement("div");
    message.className = "message ai";
    message.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "P";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;

    message.appendChild(avatar);
    message.appendChild(bubble);
    chatBox.appendChild(message);
    chatBox.scrollTop = chatBox.scrollHeight;
    return message;
}

/* ------------------------------------------------------------
   System prompt builder
------------------------------------------------------------ */

function buildSystemPrompt() {
    const company = companySelect.value;
    const course = courseSelect.value;

    let companyInfo = "No company selected. Give general placement guidance.";
    if (company && COMPANIES[company]) {
        const data = COMPANIES[company];
        companyInfo =
            "Company : " + company + "\n" +
            "Hiring Rounds : " + data.rounds + "\n" +
            "Eligibility : " + data.eligibility + "\n" +
            "Focus Areas : " + data.focus;
    }

    let instructions = "";
    switch (currentMode) {
        case "ask":
            instructions = "You are a placement assistant. Answer clearly and helpfully.";
            break;
        case "rolefit":
            instructions = "Evaluate the student's role fit for " + (course || "their course") + ". Be specific about eligibility gaps and strengths.";
            break;
        case "mock":
            instructions = "Generate exactly five MCQs with four options each (A-D). List correct answers at the end under a heading 'Answers'.";
            break;
        case "resume":
            instructions = "Review the resume text provided and give actionable suggestions. Include a match score out of 10 for the selected company.";
            break;
        case "pdf":
            instructions = "Create a detailed day-wise preparation plan. If the user states how many days they have, use that number. Otherwise assume 7 days.";
            break;
    }

    instructions += "\n\nFormat every response neatly using markdown.\nUse headings and bullet points.\nUse fenced code blocks for any code.\nKeep paragraphs short.\n";
    return instructions + "\n\n" + companyInfo;
}

/* ------------------------------------------------------------
   Attachments — "+" popup menu, chips, drag & drop, paste
------------------------------------------------------------ */

function closeAttachMenu() {
    attachMenu.classList.remove("open");
    attachMenu.hidden = true;
    attachBtn.setAttribute("aria-expanded", "false");
}
function openAttachMenu() {
    attachMenu.hidden = false;
    requestAnimationFrame(() => attachMenu.classList.add("open"));
    attachBtn.setAttribute("aria-expanded", "true");
}
attachBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (attachMenu.classList.contains("open")) closeAttachMenu();
    else openAttachMenu();
});
document.addEventListener("click", () => closeAttachMenu());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAttachMenu(); });
attachMenu.addEventListener("click", (e) => e.stopPropagation());

attachMenu.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
        closeAttachMenu();
        const action = btn.dataset.action;
        if (action === "pdf") pdfInput.click();
        else if (action === "image") imageInput.click();
        else if (action === "resume") resumeInput.click();
        else if (action === "document") documentInput.click();
        else if (action === "camera") cameraInput.click();
        else multiInput.click();
    });
});

pdfInput.addEventListener("change", () => { uploadFiles([...pdfInput.files]); pdfInput.value = ""; });
imageInput.addEventListener("change", () => { uploadFiles([...imageInput.files]); imageInput.value = ""; });
documentInput.addEventListener("change", () => { uploadFiles([...documentInput.files]); documentInput.value = ""; });
multiInput.addEventListener("change", () => { uploadFiles([...multiInput.files]); multiInput.value = ""; });
resumeInput.addEventListener("change", () => { uploadFiles([...resumeInput.files]); resumeInput.value = ""; });
cameraInput.addEventListener("change", () => { uploadFiles([...cameraInput.files]); cameraInput.value = ""; });

["dragover", "dragenter"].forEach((evt) =>
    composerInner.addEventListener(evt, (e) => { e.preventDefault(); composerInner.classList.add("drag-over"); })
);
["dragleave", "drop"].forEach((evt) =>
    composerInner.addEventListener(evt, (e) => { e.preventDefault(); composerInner.classList.remove("drag-over"); })
);
composerInner.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) uploadFiles(files);
});

userInput.addEventListener("paste", (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const files = items.filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
    if (files.length) uploadFiles(files);
});

const FILE_TYPE_LABELS = { pdf: "PDF", image: "Image", document: "Document" };

function renderFileChips() {
    fileChips.innerHTML = "";
    fileChips.hidden = attachedFiles.length === 0;
    attachedFiles.forEach((f) => {
        const chip = document.createElement("span");
        chip.className = "file-chip";
        chip.innerHTML = `<span class="file-chip-name">${FILE_TYPE_LABELS[f.type] || "File"} · ${escapeHtml(f.name)}</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "file-chip-remove";
        removeBtn.setAttribute("aria-label", "Remove " + f.name);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", async () => {
            attachedFiles = attachedFiles.filter((x) => x.id !== f.id);
            renderFileChips();
            try {
                await fetch("/api/remove-file", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ id: f.id }) });
            } catch {}
        });
        chip.appendChild(removeBtn);
        fileChips.appendChild(chip);
    });
}

function clearAttachedFilesUI() {
    attachedFiles = [];
    renderFileChips();
    pdfInput.value = "";
    imageInput.value = "";
    documentInput.value = "";
    multiInput.value = "";
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

async function uploadFiles(files) {
    if (!files.length) return;

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const chip = document.createElement("span");
    chip.className = "file-chip file-chip-uploading";
    chip.textContent = "Uploading " + files.length + " file" + (files.length > 1 ? "s" : "") + "…";
    fileChips.hidden = false;
    fileChips.appendChild(chip);

    try {
        const response = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: formData });
        const data = await response.json();
        chip.remove();

        if (response.ok) {
            attachedFiles.push(...(data.files || []));
            renderFileChips();
            if (data.errors && data.errors.length) toast(data.errors.join(" · "), true);
            if (data.files && data.files.length) toast(data.files.length + " file(s) attached");
        } else {
            toast(data.error || "Upload failed", true);
        }
    } catch (err) {
        console.error("Upload error:", err);
        chip.remove();
        toast("Could not reach the server while uploading.", true);
    }

    pdfInput.value = "";
    imageInput.value = "";
    documentInput.value = "";
    multiInput.value = "";
}

/* ------------------------------------------------------------
   Image-generation intent detection
------------------------------------------------------------ */

const IMAGE_INTENT = /\b(generate|create|draw|make)\b.{0,40}\b(image|logo|illustration|artwork|diagram|architecture diagram|flowchart|picture|icon)\b/i;

function detectImagePrompt(text) {
    return IMAGE_INTENT.test(text) ? text : null;
}

async function handleImageGeneration(prompt) {
    const typing = addTypingIndicator();
    try {
        const response = await fetch("/api/generate-image", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        typing.remove();

        if (response.ok && data.image) {
            renderImageMessage(data.image, prompt);
            activeMessages.push({ role: "assistant", content: "[Generated image for: " + prompt + "]", ts: Date.now() });
            if (!activeChatId) { const chat = createNewChatRecord(); activeChatId = chat.id; }
            persistActiveChat();
        } else {
            renderMessage(data.error || "Image generation failed.", "system", { noActions: true, skipStore: true });
        }
    } catch (err) {
        console.error("Image generation error:", err);
        typing.remove();
        renderMessage("Could not reach the server to generate the image.", "system", { noActions: true, skipStore: true });
    }
}

/* ------------------------------------------------------------
   Sending a chat message (streamed)
------------------------------------------------------------ */

let lastUserMessage = "";
let activeStreamController = null;

function setStreamingUI(isStreaming) {
    sendBtn.hidden = isStreaming;
    stopBtn.hidden = !isStreaming;
}

stopBtn.addEventListener("click", () => {
    if (activeStreamController) activeStreamController.abort();
});

async function sendMessage() {
    const text = userInput.value.trim();
    if (text === "") return;

    renderMessage(text, "user");
    lastUserMessage = text;
    userInput.value = "";
    autoResizeTextarea();
    sendBtn.disabled = true;

    const imagePrompt = detectImagePrompt(text);
    if (imagePrompt) {
        await handleImageGeneration(imagePrompt);
        sendBtn.disabled = false;
        userInput.focus();
        return;
    }

    await streamReply(text);
    sendBtn.disabled = false;
    userInput.focus();
}

async function streamReply(text) {
    const systemPrompt = buildSystemPrompt();
    const history = activeMessages.slice(0, -1).slice(-16).map((m) => ({ role: m.role, content: m.content }));

    const typingIndicator = addTypingIndicator();
    let aiEl = null;
    let aiMessageEl = null;
    let fullText = "";

    activeStreamController = new AbortController();
    setStreamingUI(true);

    const finalizeMessage = () => {
        if (fullText && aiEl && aiMessageEl && !aiMessageEl.querySelector(".message-actions-wrap")) {
            aiMessageEl.appendChild(addMessageActions(aiEl, fullText, "ai", Date.now()));
        }
    };

    try {
        const response = await fetch("/api/chat/stream", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ systemPrompt, userMessage: text, history }),
            signal: activeStreamController.signal
        });

        if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            typingIndicator.remove();
            renderMessage(data.error || "Unable to get a response from the AI.", "system", { noActions: true, skipStore: true });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let removedTyping = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop();

            for (const evt of events) {
                const line = evt.split("\n").find((l) => l.startsWith("data:"));
                if (!line) continue;
                let payload;
                try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }

                if (payload.error) {
                    if (!removedTyping) { typingIndicator.remove(); removedTyping = true; }
                    renderMessage(payload.error, "system", { noActions: true, skipStore: true });
                    setStatus(false);
                    return;
                }

                if (payload.delta) {
                    if (!removedTyping) { typingIndicator.remove(); removedTyping = true; }
                    fullText += payload.delta;
                    if (!aiEl) {
                        const rendered = renderMessage(fullText, "ai", { skipStore: true, noActions: true });
                        aiEl = rendered.bubble;
                        aiMessageEl = rendered.message;
                    } else {
                        aiEl.innerHTML = marked.parse(fullText);
                        renderCodeBlocks(aiEl);
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                }

                if (payload.done) {
                    if (fullText) {
                        activeMessages.push({ role: "assistant", content: fullText, ts: Date.now() });
                        if (!activeChatId) { const chat = createNewChatRecord(); activeChatId = chat.id; }
                        persistActiveChat();
                        finalizeMessage();
                    }
                }
            }
        }

        if (!fullText) {
            if (!removedTyping) typingIndicator.remove();
            renderMessage("No response received. Check server logs.", "system", { noActions: true, skipStore: true });
        }
    } catch (error) {
        if (error.name === "AbortError") {
            // User clicked Stop — keep whatever text streamed in so far.
            typingIndicator.remove();
            if (fullText) {
                activeMessages.push({ role: "assistant", content: fullText, ts: Date.now() });
                if (!activeChatId) { const chat = createNewChatRecord(); activeChatId = chat.id; }
                persistActiveChat();
                finalizeMessage();
            }
        } else {
            console.error("Chat error:", error);
            typingIndicator.remove();
            renderMessage("Could not reach the server. Make sure the server is running, then refresh this page.", "system", { noActions: true, skipStore: true });
            setStatus(false);
        }
    } finally {
        activeStreamController = null;
        setStreamingUI(false);
    }
}

async function regenerateLast() {
    if (!lastUserMessage) return;
    if (activeMessages.length && activeMessages[activeMessages.length - 1].role === "assistant") {
        activeMessages.pop();
        persistActiveChat();
        const last = chatBox.querySelector(".message.ai:last-of-type");
        if (last) last.remove();
    }
    sendBtn.disabled = true;
    await streamReply(lastUserMessage);
    sendBtn.disabled = false;
}

sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

function autoResizeTextarea() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
}
userInput.addEventListener("input", autoResizeTextarea);

/* ------------------------------------------------------------
   Download any AI response as a formatted PDF
------------------------------------------------------------ */

async function downloadAsPdf(text) {
    try {
        const response = await fetch("/api/download", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ text, title: MODE_LABELS[currentMode] || "Placement Assistant" })
        });

        if (!response.ok) { toast("PDF download failed.", true); return; }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Placement_Assistant_Response.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Download error:", err);
        toast("Could not reach the server to generate the PDF.", true);
    }
}

downloadBtn.addEventListener("click", () => {
    const lastAi = [...activeMessages].reverse().find((m) => m.role === "assistant");
    if (!lastAi) { toast("No AI response to download yet.", true); return; }
    downloadAsPdf(lastAi.content);
});

/* ------------------------------------------------------------
   New chat
------------------------------------------------------------ */

newChatBtn.addEventListener("click", startNewChat);

/* ------------------------------------------------------------
   Connection status indicator
------------------------------------------------------------ */

function setStatus(connected) {
    statusDot.classList.toggle("connected", connected);
    statusDot.classList.toggle("disconnected", !connected);
    statusText.textContent = connected ? "Connected" : "Disconnected";
}

async function checkStatus() {
    try {
        const response = await fetch("/api/status", { headers: authHeaders() });
        if (!response.ok) throw new Error("bad status");
        await response.json();
        setStatus(true);
    } catch {
        setStatus(false);
    }
}
checkStatus();
setInterval(checkStatus, 15000);

/* ------------------------------------------------------------
   Initial view
------------------------------------------------------------ */

showEmptyState();
renderHistoryList();
console.log("Placement Assistant (Gen AI Internship) — frontend loaded.");
