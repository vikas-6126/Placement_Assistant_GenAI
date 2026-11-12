# Placement Assistant (Gen AI Internship)

A lightweight, ChatGPT-style placement assistant. Vanilla HTML/CSS/JS
frontend, one Express backend, Gemini → Groq → OpenRouter fallback.

## How to run

```bash
npm install
npm start
```

(`npm install` at the root also installs the `server/` dependencies
automatically via `postinstall`. If you'd rather do it manually:
`cd server && npm install && node server.js`.)

Then open **http://localhost:3000** — one address for everything
(frontend + API). Your `server/.env` already has API keys; only one
provider needs to be set for the app to work.

> Heads up: the API keys already in `server/.env` are visible in plain
> text in this project. If this project is ever pushed to GitHub or
> shared, rotate those keys first — `.env` is gitignored, but the keys
> themselves are not secret just because the file is ignored.

---

## What's new in this pass

- **Emoji-free, ChatGPT-style UI** — sidebar with mode switcher,
  company/course pickers, and a chat history list (rename/delete),
  large scrollable chat area, bottom composer with a `+` attach menu.
- **Multi-file attachments** — the `+` button next to the textarea
  opens Upload PDF / Upload Image / Upload Multiple Files. Selected
  files show as removable chips above the composer. Drag-and-drop and
  paste (Ctrl+V) onto the composer work too.
- **Multiple PDFs and images per session** — the backend keeps a
  per-browser context (via an `X-Session-Id` header, no login needed)
  so several PDFs/images can be referenced in the same conversation.
  "New chat" clears that context.
- **Real streaming responses** — `/api/chat/stream` proxies Gemini's
  SSE stream (and Groq/OpenRouter's OpenAI-compatible `stream: true`)
  so replies type out live instead of arriving all at once.
- **AI image generation** — asking to "generate/create/draw an image,
  logo, diagram, flowchart…" routes to `/api/generate-image`, which
  uses Pollinations (free, no API key) and returns a downloadable
  image inline in the chat.
- **Markdown rendering with real code blocks** — syntax highlighting
  (highlight.js), a language label + Copy button on every code block,
  and styled tables.
- **Per-message actions** — every message gets Copy; AI messages also
  get Download PDF and Regenerate.
- **Smarter PDF export** — `/api/download` now actually parses a
  practical markdown subset (headings, bold, bullets, numbered lists,
  tables, horizontal rules) into a properly formatted PDF, instead of
  dumping raw text.
- **Chat history in localStorage** — conversations persist across
  reloads, with rename/delete from the sidebar.

## What's new in this pass

- **Settings panel** — light/dark theme, 5 accent colors, 3 font
  sizes, all persisted and applied instantly via CSS variables/data
  attributes (no reload). Also: export all chats to a JSON file,
  import a JSON export back in (merged by chat id), and clear all
  history.
- **Collapsible sidebar** — a chevron button shrinks the sidebar to
  an icon rail on desktop; state persists across reloads.
- **Search + pin chats** — a search box filters the chat list by
  title; each chat can be pinned, and pinned chats sort to the top.
- **Stop Generating** — streaming responses can be interrupted
  mid-stream (AbortController); whatever text has streamed in so far
  is kept and saved.
- **Message timestamps + like/dislike** — every message shows a
  send time; AI messages get thumbs up/down (local UI feedback, not
  wired to a backend rating store).
- **Broader document support** — uploads now accept `.docx` (parsed
  with `mammoth`), `.txt`, `.md`, `.csv`, and `.json`, alongside the
  existing PDF/image handling, all through the same multi-file
  pipeline and the same AI context.
- **`npm install && npm start` from the project root** now works
  end-to-end — a `postinstall` script installs `server/`'s
  dependencies automatically.

### Honestly scoped out of this pass

The original ask also included a fully separate application-style UI
per mode (a resume dashboard, an exam interface, an analytics screen,
a timeline planner), a complete conversational AI Resume Builder with
templates and DOCX export, camera/microphone input, and PPTX/XLSX/ZIP
parsing. Those are each substantial standalone features — building
them shallowly in the same pass as everything above would produce
something that looks finished but breaks under real use. They're
good candidates for the next round, tackled one at a time.

## File structure

```
index.html            Page shell (sidebar + chat + composer)
style.css              All styling (white/light-grey, ChatGPT-inspired)
script.js              All frontend logic (uploads, streaming, history, actions)
data.js                Company/course knowledge base (unchanged)
server/server.js        Express app: frontend + all /api routes
server/package.json     Backend dependencies
server/.env              Your API keys (not included in version control)
```

## API routes

| Route | Purpose |
|---|---|
| `GET /api/status` | Health check + which providers are configured + current session's attached files |
| `POST /api/upload` | Multipart upload, any mix of PDFs/images, field name `files` |
| `POST /api/remove-file` | Remove one attached file by id |
| `POST /api/clear-context` | Clear all attached files for the session (called by "New chat") |
| `POST /api/chat` | Non-streaming chat (fallback) |
| `POST /api/chat/stream` | Streaming chat via Server-Sent Events |
| `POST /api/generate-image` | AI image generation (Pollinations) |
| `POST /api/download` | Render markdown text into a formatted PDF |

## Known limitations

- No database — chat history lives in the browser's `localStorage`,
  and uploaded file *content* lives in the server's memory per
  session (cleared on server restart or "New chat"). This suits a
  single-user local tool; it isn't multi-device or multi-user.
- OCR/text-in-image extraction relies on Gemini's vision understanding
  rather than a dedicated OCR library — this covers "extract text from
  this image" style requests without adding a heavy dependency.
- `node_modules` is not included — run `npm install` inside `server/`
  after unzipping.
