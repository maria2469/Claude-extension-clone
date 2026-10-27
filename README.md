# Malude — Claude Browser Extension Clone

An open-source Chrome extension that brings Claude-style AI assistance directly into your browser sidebar. Built with a **WXT + React + Tailwind** extension frontend and a **FastAPI + Groq/Anthropic** backend.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-orange?logo=googlechrome)
![Python](https://img.shields.io/badge/Python-3.12+-blue?logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

| Feature | Status | Description |
|---|---|---|
| **Interactive DOM Awareness** | ✅ | Reads page elements with ref IDs for precise interaction |
| **Autonomous Browser Agent** | ✅ | Click, type, scroll, navigate — up to 10-step tool loops |
| **Safety Approval Cards** | ✅ | Human-in-the-loop confirmation for sensitive actions |
| **Multi-Tab Workflows** | ✅ | Open/switch/close tabs with agent tab groups |
| **Session History** | ✅ | Persistent chat history with chrome.storage.local |
| **Screenshot Vision** | 🔲 | Multimodal screenshots sent to LLM |
| **Artifacts Viewer** | 🔲 | Split-panel code/HTML preview |

## 📁 Project Structure

```
claude-extension/
├── apps/
│   ├── api/                    # FastAPI backend (Python)
│   │   ├── app/
│   │   │   ├── agent/          # LLM provider, prompts, types
│   │   │   ├── api/v1/routes/  # REST + SSE endpoints
│   │   │   ├── core/           # Config, security, CORS
│   │   │   ├── db/             # SQLAlchemy models
│   │   │   └── services/       # Rate limiting, usage tracking
│   │   ├── tests/              # pytest test suite
│   │   ├── .env.example        # ← copy to .env
│   │   └── pyproject.toml
│   └── extension/              # Chrome Extension (TypeScript)
│       ├── entrypoints/        # background, content, sidepanel
│       ├── src/
│       │   ├── agent/          # Action executor + tool definitions
│       │   ├── api/            # SSE client + fetch wrapper
│       │   ├── app/            # ChatScreen, Onboarding
│       │   ├── bus/            # Cross-context message bus (Zod)
│       │   ├── components/     # UI components (layout, sections, ui)
│       │   ├── content/        # DOM extractor, copy handler
│       │   ├── store/          # Zustand stores (settings, history, etc.)
│       │   └── styles/         # Tailwind CSS
│       ├── package.json
│       └── wxt.config.ts
└── package.json                # Monorepo root scripts
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.12
- **uv** (Python package manager) — `pip install uv`
- A **Groq API key** (free at [console.groq.com](https://console.groq.com)) or Anthropic API key

### 1. Clone the repo

```bash
git clone https://github.com/maria2469/Claude-extension-clone.git
cd Claude-extension-clone
```

### 2. Set up the API backend

```bash
cd apps/api
cp .env.example .env            # Edit .env and add your GROQ_API_KEY
python -m venv .venv
.venv/Scripts/activate          # Windows
# source .venv/bin/activate     # macOS/Linux
uv pip install -e ".[dev]"
```

### 3. Start the API server

```bash
cd apps/api
.venv/Scripts/uvicorn app.main:app --port 8080 --reload
```

### 4. Set up the Chrome extension

```bash
cd apps/extension
npm install
```

### 5. Start development

From the **project root**:

```bash
npm run dev
```

This starts the WXT dev server and opens Chrome with the extension auto-loaded. The sidepanel opens via the extension icon or **Ctrl+Shift+.** keyboard shortcut.

### 6. Build for production

```bash
npm run build
```

The built extension will be in `apps/extension/.output/chrome-mv3/`.

## ⚙️ Configuration

### LLM Provider

Edit `apps/api/.env`:

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | Groq API key (recommended — free & fast) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (higher quality, paid) |
| `MODEL_AGENT` | `llama-3.3-70b-versatile` | Model for agent reasoning |
| `MODEL_FAST` | `llama-3.1-8b-instant` | Model for classify/review/summarize |

> **Tip:** If both `GROQ_API_KEY` and `ANTHROPIC_API_KEY` are set, Groq takes priority.

### Auth (Optional)

For development, the API uses a built-in `dev-secret` JWT. For production, configure Supabase:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_JWKS_URL` | JWKS endpoint for RS256 token validation |
| `SUPABASE_JWT_SECRET` | Fallback HS256 JWT secret |

## 🧪 Running Tests

### API tests (Python)

```bash
cd apps/api
.venv/Scripts/activate
pytest -v
```

### Extension tests (TypeScript)

```bash
cd apps/extension
npm test
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
