/* ============================================================
   Placement Assistant (Gen AI Internship) — Backend Server
   ------------------------------------------------------------
   Single Express server that:
     1. Serves the frontend (index.html, style.css, script.js, data.js)
     2. Serves the /api/* endpoints the frontend calls

   Every fetch() on the frontend uses a RELATIVE path ("/api/chat"),
   so the app never breaks from a port mismatch — one address does
   everything: http://localhost:3000
   ============================================================ */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const PDFDocument = require("pdfkit");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_DIR = path.join(__dirname, "..");

/* ------------------------------------------------------------
   Middleware
------------------------------------------------------------ */

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(FRONTEND_DIR));

/* ------------------------------------------------------------
   File upload handling (Multer) — memory storage, multiple files
------------------------------------------------------------ */

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 10 } // 20 MB per file, 10 files per request
});

/* ------------------------------------------------------------
   Per-browser session context (in-memory).
   The frontend generates a random session id and sends it as
   the "x-session-id" header on every request, so each browser
   tab/profile keeps its own uploaded PDFs / images without a
   database. "New chat" clears a session's entry.
------------------------------------------------------------ */

const sessions = new Map(); // sessionId -> { pdfs: [{id,name,text}], images: [{id,name,mimeType,base64}] }

function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { pdfs: [], images: [] });
    }
    return sessions.get(sessionId);
}

function sessionIdFrom(req) {
    return (req.headers["x-session-id"] || "default").toString().slice(0, 100);
}

/* ------------------------------------------------------------
   AI provider configuration
------------------------------------------------------------ */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

console.log("==================================");
console.log("Placement Assistant (Gen AI Internship)");
console.log("==================================");
console.log("GEMINI_API_KEY loaded:", process.env.GEMINI_API_KEY ? "YES" : "NO");
console.log("GROQ_API_KEY loaded:", process.env.GROQ_API_KEY ? "YES" : "NO");
console.log("OPENROUTER_API_KEY loaded:", process.env.OPENROUTER_API_KEY ? "YES" : "NO");
console.log("(You only need ONE of the above set. Server tries them in order: Gemini -> Groq -> OpenRouter)");

/* ------------------------------------------------------------
   Helper: build the user-facing text, injecting PDF context
------------------------------------------------------------ */

function buildUserContent(session, userMessage) {
    let content = "";

    if (session.pdfs.length > 0) {
        content += "Reference material extracted from uploaded PDF(s):\n\n";
        session.pdfs.forEach((pdf) => {
            content += `--- ${pdf.name} ---\n${pdf.text.substring(0, 20000)}\n\n`;
        });
    }

    content += "Question:\n" + userMessage;
    return content;
}

function historyToGeminiContents(history) {
    return (history || []).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
    }));
}

function historyToOpenAIMessages(history) {
    return (history || []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
    }));
}

/* ------------------------------------------------------------
   Provider: Gemini — non-streaming (used as internal fallback)
------------------------------------------------------------ */

async function callGemini(systemPrompt, userMessage, session, history) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

    const userParts = [];
    session.images.forEach((img) => {
        userParts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    });
    userParts.push({ text: buildUserContent(session, userMessage) });

    const contents = [...historyToGeminiContents(history), { role: "user", parts: userParts }];

    const requestBody = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    };

    const response = await fetch(GEMINI_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error("Gemini " + response.status + ": " + (await safeErrorText(response)));

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("Gemini returned an empty reply.");
    return reply;
}

/* ------------------------------------------------------------
   Shared helper: OpenAI-style chat completion (Groq / OpenRouter)
------------------------------------------------------------ */

async function callOpenAICompatible(providerName, url, apiKey, model, systemPrompt, userMessage, session, history, extraHeaders = {}) {
    if (!apiKey) throw new Error(providerName + "_API_KEY not set");

    const requestBody = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            ...historyToOpenAIMessages(history),
            { role: "user", content: buildUserContent(session, userMessage) }
        ],
        temperature: 0.7,
        max_tokens: 2048
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, ...extraHeaders },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error(providerName + " " + response.status + ": " + (await safeErrorText(response)));

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error(providerName + " returned an empty reply.");
    return reply;
}

async function safeErrorText(response) {
    // Read the body exactly once as text, then try to pretty-print it as
    // JSON. Calling .json() and .text() on the same response separately
    // throws "Body already read" the moment the first call fails.
    const raw = await response.text();
    try {
        return JSON.stringify(JSON.parse(raw));
    } catch {
        return raw;
    }
}

function callGroq(systemPrompt, userMessage, session, history) {
    return callOpenAICompatible("GROQ", GROQ_URL, process.env.GROQ_API_KEY, GROQ_MODEL, systemPrompt, userMessage, session, history);
}

function callOpenRouter(systemPrompt, userMessage, session, history) {
    return callOpenAICompatible(
        "OPENROUTER", OPENROUTER_URL, process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL,
        systemPrompt, userMessage, session, history,
        { "HTTP-Referer": "http://localhost:3000", "X-Title": "Placement Assistant (Gen AI Internship)" }
    );
}

function availableProviders() {
    return [
        { name: "Gemini", key: process.env.GEMINI_API_KEY },
        { name: "Groq", key: process.env.GROQ_API_KEY },
        { name: "OpenRouter", key: process.env.OPENROUTER_API_KEY }
    ].filter((p) => p.key);
}

/* ------------------------------------------------------------
   Routes: status / health check
------------------------------------------------------------ */

app.get("/api/status", (req, res) => {
    const session = getSession(sessionIdFrom(req));
    res.json({
        status: "connected",
        port: PORT,
        providers: {
            gemini: Boolean(process.env.GEMINI_API_KEY),
            groq: Boolean(process.env.GROQ_API_KEY),
            openrouter: Boolean(process.env.OPENROUTER_API_KEY)
        },
        context: {
            pdfs: session.pdfs.map((p) => ({ id: p.id, name: p.name })),
            images: session.images.map((i) => ({ id: i.id, name: i.name }))
        }
    });
});

/* ------------------------------------------------------------
   Routes: uploads — accepts any mix of PDFs / images at once
------------------------------------------------------------ */

app.post("/api/upload", upload.array("files", 10), async (req, res) => {
    const session = getSession(sessionIdFrom(req));
    const results = [];
    const errors = [];

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded." });
    }

    for (const file of req.files) {
        try {
            const lowerName = file.originalname.toLowerCase();
            const isPdf = file.mimetype === "application/pdf" || lowerName.endsWith(".pdf");
            const isDocx = lowerName.endsWith(".docx") || file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            const isPlainText = /\.(txt|md|markdown|csv|json)$/.test(lowerName);
            const isImage = file.mimetype.startsWith("image/");

            if (isPdf) {
                const pdf = await pdfParse(file.buffer);
                const entry = { id: crypto.randomUUID(), name: file.originalname, text: pdf.text || "" };
                session.pdfs.push(entry);
                results.push({ id: entry.id, name: entry.name, type: "pdf", charCount: entry.text.length });
            } else if (isDocx) {
                const { value } = await mammoth.extractRawText({ buffer: file.buffer });
                const entry = { id: crypto.randomUUID(), name: file.originalname, text: value || "" };
                session.pdfs.push(entry);
                results.push({ id: entry.id, name: entry.name, type: "document", charCount: entry.text.length });
            } else if (isPlainText) {
                const text = file.buffer.toString("utf8");
                const entry = { id: crypto.randomUUID(), name: file.originalname, text };
                session.pdfs.push(entry);
                results.push({ id: entry.id, name: entry.name, type: "document", charCount: text.length });
            } else if (isImage) {
                const entry = {
                    id: crypto.randomUUID(),
                    name: file.originalname,
                    mimeType: file.mimetype,
                    base64: file.buffer.toString("base64")
                };
                // Keep a sane cap so requests to the AI providers don't balloon.
                if (session.images.length >= 6) session.images.shift();
                session.images.push(entry);
                results.push({ id: entry.id, name: entry.name, type: "image" });
            } else {
                errors.push(file.originalname + ": unsupported file type (PDF, DOCX, TXT, MD, CSV, JSON, and images are supported)");
            }
        } catch (err) {
            errors.push(file.originalname + ": " + err.message);
        }
    }

    res.json({ files: results, errors });
});

app.post("/api/remove-file", (req, res) => {
    const session = getSession(sessionIdFrom(req));
    const { id } = req.body;
    session.pdfs = session.pdfs.filter((p) => p.id !== id);
    session.images = session.images.filter((i) => i.id !== id);
    res.json({ ok: true });
});

app.post("/api/clear-context", (req, res) => {
    sessions.set(sessionIdFrom(req), { pdfs: [], images: [] });
    res.json({ message: "Context cleared." });
});

/* ------------------------------------------------------------
   Route: chat (non-streaming fallback, tries Gemini -> Groq -> OpenRouter)
------------------------------------------------------------ */

app.post("/api/chat", async (req, res) => {
    const session = getSession(sessionIdFrom(req));
    const systemPrompt = req.body.systemPrompt || "";
    const userMessage = req.body.userMessage || "";
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-16) : [];

    if (!userMessage.trim()) return res.status(400).json({ error: "userMessage is required." });

    const providers = [
        { name: "Gemini", fn: callGemini, key: process.env.GEMINI_API_KEY },
        { name: "Groq", fn: callGroq, key: process.env.GROQ_API_KEY },
        { name: "OpenRouter", fn: callOpenRouter, key: process.env.OPENROUTER_API_KEY }
    ].filter((p) => p.key);

    if (providers.length === 0) {
        return res.status(500).json({ error: "No API key set. Add at least one of GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY in server/.env" });
    }

    const errors = [];
    for (const provider of providers) {
        try {
            const reply = await provider.fn(systemPrompt, userMessage, session, history);
            return res.json({ reply, provider: provider.name });
        } catch (err) {
            console.error(provider.name, "failed:", err.message);
            errors.push(provider.name + ": " + err.message);
        }
    }

    res.status(502).json({ error: "All configured AI providers failed.", detail: errors });
});

/* ------------------------------------------------------------
   Route: chat streaming via Server-Sent Events.
   Frontend POSTs here and reads the response body as a stream.
   Each event line looks like: data: {"delta":"..."}\n\n
   Final event: data: {"done":true,"provider":"Gemini"}\n\n
------------------------------------------------------------ */

app.post("/api/chat/stream", async (req, res) => {
    const session = getSession(sessionIdFrom(req));
    const systemPrompt = req.body.systemPrompt || "";
    const userMessage = req.body.userMessage || "";
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-16) : [];

    if (!userMessage.trim()) return res.status(400).json({ error: "userMessage is required." });

    const providers = availableProviders();
    if (providers.length === 0) {
        return res.status(500).json({ error: "No API key set. Add at least one of GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY in server/.env" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (obj) => res.write("data: " + JSON.stringify(obj) + "\n\n");

    for (const provider of providers) {
        try {
            if (provider.name === "Gemini") {
                await streamGemini(systemPrompt, userMessage, session, history, send);
            } else if (provider.name === "Groq") {
                await streamOpenAICompatible(GROQ_URL, process.env.GROQ_API_KEY, GROQ_MODEL, systemPrompt, userMessage, session, history, send);
            } else {
                await streamOpenAICompatible(
                    OPENROUTER_URL, process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL,
                    systemPrompt, userMessage, session, history, send,
                    { "HTTP-Referer": "http://localhost:3000", "X-Title": "Placement Assistant (Gen AI Internship)" }
                );
            }
            send({ done: true, provider: provider.name });
            return res.end();
        } catch (err) {
            console.error(provider.name, "stream failed:", err.message);
            // Try the next provider silently — the client only sees a clean stream.
        }
    }

    send({ error: "All configured AI providers failed." });
    res.end();
});

async function streamGemini(systemPrompt, userMessage, session, history, send) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

    const userParts = [];
    session.images.forEach((img) => userParts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));
    userParts.push({ text: buildUserContent(session, userMessage) });

    const contents = [...historyToGeminiContents(history), { role: "user", parts: userParts }];

    const response = await fetch(GEMINI_STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
    });

    if (!response.ok) throw new Error("Gemini " + response.status + ": " + (await safeErrorText(response)));

    let gotAny = false;
    let buffer = "";
    for await (const chunk of response.body) {
        buffer += Buffer.from(chunk).toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;
            try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    gotAny = true;
                    send({ delta: text });
                }
            } catch {
                // ignore partial/malformed chunk
            }
        }
    }
    if (!gotAny) throw new Error("Gemini returned an empty stream.");
}

async function streamOpenAICompatible(url, apiKey, model, systemPrompt, userMessage, session, history, send, extraHeaders = {}) {
    if (!apiKey) throw new Error("API key not set");

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, ...extraHeaders },
        body: JSON.stringify({
            model,
            stream: true,
            messages: [
                { role: "system", content: systemPrompt },
                ...historyToOpenAIMessages(history),
                { role: "user", content: buildUserContent(session, userMessage) }
            ],
            temperature: 0.7,
            max_tokens: 2048
        })
    });

    if (!response.ok) throw new Error(response.status + ": " + (await safeErrorText(response)));

    let gotAny = false;
    let buffer = "";
    for await (const chunk of response.body) {
        buffer += Buffer.from(chunk).toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.choices?.[0]?.delta?.content;
                if (text) {
                    gotAny = true;
                    send({ delta: text });
                }
            } catch {
                // ignore partial/malformed chunk
            }
        }
    }
    if (!gotAny) throw new Error("Provider returned an empty stream.");
}

/* ------------------------------------------------------------
   Route: AI image generation (Pollinations — free, no API key)
------------------------------------------------------------ */

app.post("/api/generate-image", async (req, res) => {
    const prompt = (req.body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "prompt is required." });

    try {
        const seed = Math.floor(Math.random() * 1_000_000);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;

        const imgResponse = await fetch(url);
        if (!imgResponse.ok) throw new Error("Image provider returned " + imgResponse.status);

        const arrayBuffer = await imgResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = imgResponse.headers.get("content-type") || "image/jpeg";

        res.json({ image: `data:${mimeType};base64,${base64}` });
    } catch (err) {
        console.error("Image generation error:", err);
        res.status(502).json({ error: "Image generation failed: " + err.message });
    }
});

/* ------------------------------------------------------------
   Route: download any text as a formatted PDF
   Understands a practical markdown subset: #/##/### headings,
   **bold**, -/* bullets, 1. numbered lists, and | table | rows |.
------------------------------------------------------------ */

app.post("/api/download", (req, res) => {
    const { text, title } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided." });

    try {
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=" + (sanitizeFilename(title) || "Placement_Assistant_Response") + ".pdf");
        doc.pipe(res);

        doc.fontSize(18).fillColor("#111827").text(title || "Placement Assistant (Gen AI Internship)", { align: "center" });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor("#6b7280").text(new Date().toLocaleString(), { align: "center" });
        doc.moveDown(1.2);

        renderMarkdownToPdf(doc, text);
        doc.end();
    } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).json({ error: "Failed to generate PDF." });
    }
});

function sanitizeFilename(name) {
    if (!name) return "";
    return name.replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 60);
}

function renderMarkdownToPdf(doc, text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let tableBuffer = [];

    const flushTable = () => {
        if (tableBuffer.length === 0) return;
        drawTable(doc, tableBuffer);
        tableBuffer = [];
    };

    for (let rawLine of lines) {
        const line = rawLine.trimEnd();

        if (/^\s*\|.*\|\s*$/.test(line)) {
            if (!/^[\s|:-]+$/.test(line)) tableBuffer.push(line);
            continue;
        } else {
            flushTable();
        }

        if (line.trim() === "") {
            doc.moveDown(0.4);
            continue;
        }

        if (/^---+$/.test(line.trim())) {
            doc.moveDown(0.2);
            doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#e5e7eb").stroke();
            doc.moveDown(0.4);
            continue;
        }

        const h3 = line.match(/^###\s+(.*)/);
        const h2 = line.match(/^##\s+(.*)/);
        const h1 = line.match(/^#\s+(.*)/);
        const bullet = line.match(/^\s*[-*]\s+(.*)/);
        const numbered = line.match(/^\s*(\d+)\.\s+(.*)/);

        if (h1) {
            doc.moveDown(0.3).fontSize(16).fillColor("#111827").text(stripInline(h1[1]), { continued: false });
            doc.moveDown(0.2);
        } else if (h2) {
            doc.moveDown(0.3).fontSize(14).fillColor("#111827").text(stripInline(h2[1]));
            doc.moveDown(0.15);
        } else if (h3) {
            doc.moveDown(0.2).fontSize(12.5).fillColor("#111827").text(stripInline(h3[1]));
            doc.moveDown(0.1);
        } else if (bullet) {
            doc.fontSize(11).fillColor("#1f2933").text("•  " + stripInline(bullet[1]), { indent: 14, lineGap: 3 });
        } else if (numbered) {
            doc.fontSize(11).fillColor("#1f2933").text(numbered[1] + ".  " + stripInline(numbered[2]), { indent: 14, lineGap: 3 });
        } else {
            doc.fontSize(11).fillColor("#1f2933").text(stripInline(line), { lineGap: 3 });
        }
    }
    flushTable();
}

function stripInline(str) {
    // Bold/italic markers read oddly in plain PDF text, so drop the
    // markers but keep the words — clean output beats broken styling.
    return str.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/`(.*?)`/g, "$1");
}

function drawTable(doc, rows) {
    const parsed = rows.map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => stripInline(c.trim())));
    if (parsed.length === 0) return;

    const colCount = parsed[0].length;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / colCount;

    doc.moveDown(0.3);
    let y = doc.y;

    parsed.forEach((row, rowIndex) => {
        const isHeader = rowIndex === 0;
        let x = doc.page.margins.left;
        const rowHeight = 20;

        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.y;
        }

        row.forEach((cell) => {
            doc.rect(x, y, colWidth, rowHeight).strokeColor("#e5e7eb").stroke();
            doc.fontSize(9.5)
                .fillColor(isHeader ? "#111827" : "#1f2933")
                .text(cell, x + 4, y + 5, { width: colWidth - 8, height: rowHeight - 6, ellipsis: true });
            x += colWidth;
        });

        y += rowHeight;
    });

    doc.y = y + 8;
}

/* ------------------------------------------------------------
   Fallback: any unknown non-API route serves index.html
------------------------------------------------------------ */

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found." });
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

/* ------------------------------------------------------------
   Global error handler
------------------------------------------------------------ */

app.use((err, req, res, next) => {
    console.error("Unhandled server error:", err);
    res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
    console.log("==================================");
    console.log("Server Running");
    console.log("Open this in your browser:");
    console.log("http://localhost:" + PORT);
    console.log("==================================");
});
