<p align="center">
  <img src="frontend/public/favicon.svg" alt="InkSolve" width="80" height="80" />
</p>

<h1 align="center">InkSolve</h1>

<p align="center">
  <strong>Draw math, get answers.</strong><br/>
  An AI-powered handwriting math solver that lets you draw equations on a canvas and get instant solutions.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Gemini-2.0_Flash-orange?logo=google" alt="Gemini" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-purple?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-cyan?logo=tailwindcss" alt="Tailwind" />
</p>

---

## What It Does

InkSolve turns your handwritten math into computed results. Draw any mathematical expression, equation, or even a graphical math problem on the canvas, hit **Calculate**, and the AI reads your handwriting, solves the math, and overlays the answer directly on the canvas.

### Supported Problem Types

| Type | Example | Output |
|---|---|---|
| **Simple expressions** | `2 + 3 * 4` | `14` |
| **Equations** | `x^2 + 2x + 1 = 0` | `x = -1` |
| **Variable assignment** | `x = 4, y = 5` | Stores for later use |
| **Graphical problems** | Drawing of a triangle with sides labeled | Calculated area/angles |
| **Abstract concepts** | Drawing of a historical scene | Identified concept |

Variables you assign are remembered across calculations and page reloads, so you can write `x = 5`, calculate, then write `2x + 3` and the AI will substitute the value.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.0 | UI framework |
| TypeScript | 5.7 | Type safety |
| Vite | 6.1 | Build tool & dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| shadcn/ui | — | Button component system |
| better-react-mathjax | 2.1 | LaTeX rendering |
| react-draggable | 4.4 | Draggable result cards |
| Axios | 1.7 | HTTP client |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.115+ | REST API framework |
| Uvicorn | 0.34+ | ASGI server |
| Google GenAI SDK | 1.0+ | Gemini 2.0 Flash integration |
| Pillow | 11.1+ | Image processing & resizing |
| Pydantic | 2.10+ | Request & input validation |

---

## Architecture

```
                     +-----------+
                     |  Browser  |
                     |  Canvas   |
                     +-----+-----+
                           |
              crop + JPEG compress (85%)
                           |
                     +-----v-----+
                     |  Vite Dev  |
                     |  Server    |
                     +-----+-----+
                           |
                    POST /calculate
                  { image, dict_of_vars }
                           |
                     +-----v-----+
                     |  FastAPI   |  validate → decode → verify → resize
                     |  Backend   |
                     +-----+-----+
                           |
                     +-----v-----+
                     |  Gemini    |
                     |  2.0 Flash |
                     +-----+-----+
                           |
              [{ expr, result, assign }]
                           |
                     +-----v-----+
                     |  Frontend  |  render LaTeX → persist history
                     |  Results   |
                     +-----------+
```

### Data Flow

1. User draws on an HiDPI-aware HTML `<canvas>` using pen tool (with color & brush size)
2. On **Calculate**, the canvas is cropped to the drawing bounding box and compressed to JPEG (~85% quality, ~100KB)
3. Cropped image + any stored variables are sent via `POST /calculate` with a 30s timeout
4. Backend validates the payload (format, size, image integrity), then resizes images > 1024px
5. Image is sent to Gemini 2.0 Flash with a detailed prompt covering 5 problem types
6. AI returns structured data, backend normalizes all fields to strings and validates the shape
7. Results render as draggable MathJax LaTeX cards positioned near the drawing
8. Variable assignments and history are stored in state and `localStorage`

---

## Project Structure

```
inksolve/
├── backend/
│   ├── main.py                    # FastAPI app, CORS, routing, server entry
│   ├── constants.py               # Config: server URL, port, Gemini API key
│   ├── schema.py                  # Pydantic model + input validation
│   ├── requirements.txt           # Python dependencies (6 direct deps)
│   └── apps/
│       └── calculator/
│           ├── route.py           # POST /calculate — validate, decode, resize, error handling
│           └── utils.py           # Gemini AI integration + prompt engineering + response normalization
│
├── frontend/
│   ├── index.html                 # Entry HTML with meta tags, fonts, favicon
│   ├── package.json               # Dependencies & scripts
│   ├── vite.config.ts             # Vite config with @ path alias
│   ├── tailwind.config.js         # Tailwind theme & CSS variable system
│   ├── postcss.config.js          # PostCSS processors
│   ├── components.json            # shadcn/ui configuration
│   ├── eslint.config.js           # ESLint flat config
│   ├── tsconfig.json              # TypeScript paths & references
│   ├── tsconfig.app.json          # App TypeScript config (ES2020, strict)
│   ├── tsconfig.node.json         # Build-tool TypeScript config
│   │
│   ├── public/
│   │   └── favicon.svg            # InkSolve icon (pen nib + equals sign)
│   │
│   └── src/
│       ├── main.tsx               # React DOM entry point (StrictMode)
│       ├── App.tsx                # Root: MathJaxContext wrapper
│       ├── App.css                # Minimal app-level styles
│       ├── index.css              # Global styles, CSS vars, animations, a11y
│       ├── constants.ts           # Color swatches (10 colors)
│       ├── vite-env.d.ts          # Vite type declarations
│       │
│       ├── lib/
│       │   └── utils.ts           # cn() classname merge utility
│       │
│       ├── components/
│       │   └── ui/
│       │       └── button.tsx     # shadcn/ui Button (6 variants, 4 sizes)
│       │
│       └── screens/
│           └── home/
│               └── index.tsx      # Main canvas UI (drawing, tools, results, history)
│
└── README.md
```

---

## Features

### Drawing Tools
- **Pen** with 10 colors and 4 brush sizes (2px, 4px, 6px, 8px)
- **Stroke eraser** that removes the entire line you touch, not just pixels
- **Undo / Redo** with 30-state history stack
- Touch support for tablets and phones (with `touch-action: none` for smooth drawing)
- HiDPI / Retina display support via `devicePixelRatio` scaling

### AI Solver
- Powered by **Gemini 2.0 Flash** for fast inference
- Handles handwritten expressions, equations, graphical problems, and abstract concepts
- PEMDAS-aware solving with step-by-step reasoning
- Variable persistence across calculations and page reloads
- Empty / unrecognized expression feedback ("Could not recognize — try writing more clearly")

### UI / UX
- Dark theme with glassmorphism panels
- Animated progress bar with step-by-step status ("Preparing image...", "Sending to AI...", "Processing results...")
- Draggable LaTeX result cards with copy & dismiss buttons
- Calculation history panel (persisted in localStorage, up to 100 entries)
- Variable badges showing stored values (click to copy, clear button)
- Toast notifications for all actions (success, error, info)
- Responsive layout (mobile-first with `sm:` breakpoints)
- Canvas auto-resize on window changes

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Calculate |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + S` | Download canvas as PNG |
| `P` | Pen tool |
| `E` | Eraser tool |
| `1` - `4` | Set brush size |
| `Shift + ?` | Show shortcuts panel |
| `Esc` | Close open panels |

### Accessibility (WCAG 2.1)
- All icon-only buttons have `aria-label` attributes
- Decorative SVGs marked `aria-hidden="true"`
- Semantic HTML: `<header>`, `<nav>`, `<aside>`, `<main>` structure
- Shortcuts modal uses `role="dialog"` + `aria-modal="true"`
- Processing status uses `role="status"` + `aria-live="polite"`
- Toast notifications use `role="alert"` + `aria-live="assertive"`
- Tool toggle buttons use `aria-pressed` state
- Canvas has `role="img"` + `aria-label`
- All animations respect `prefers-reduced-motion`
- Minimum 32x32px touch targets on all interactive elements

### Error Handling
- **Frontend:** Differentiates between timeout, network down, 400, 502, and unknown errors with clear user messages
- **Frontend:** Empty canvas guard — blocks API call if nothing is drawn
- **Frontend:** Validates API response shape before processing
- **Backend:** Validates base64 format, payload size (10MB max), image integrity (`Image.verify()`)
- **Backend:** Validates `dict_of_vars` (max 50 vars, key length limits, value type checks)
- **Backend:** Returns specific HTTP error codes: 400 (bad input), 413 (too large), 502 (AI failure)
- **Backend:** Empty AI response returns `status: "empty"` with descriptive message

### Security
- CORS restricted to localhost origins in production (open only in dev mode)
- Input payload size limit (10MB)
- Variable dictionary validation (max 50 entries, string keys, scalar values)
- Image format verification before processing
- API key loaded from environment, never hardcoded

### Performance Optimizations
- Canvas cropped to drawing bounding box before upload (reduces payload from ~3MB to ~100KB)
- JPEG compression at 85% quality for uploads
- Backend resizes images > 1024px before sending to Gemini
- Bounding box calculated from stroke point data (O(points)) instead of pixel scanning (O(width*height))
- Drawing uses refs instead of state to avoid re-renders during strokes
- HiDPI canvas scaling for sharp rendering on Retina/4K displays
- 30-second request timeout prevents hung requests
- Removed 5 unused dependencies (~730KB savings): Mantine, react-router-dom, html2canvas, lucide-react

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+
- A **Google Gemini API key** ([Get one here](https://aistudio.google.com/apikey))

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Create environment file (see note below)
python -c "open('.env','w').write('GEMINI_API_KEY=your_api_key_here\n')"

# Start the server
python main.py
```

> **Windows `.env` warning:** Do NOT use `echo "..." > .env` in PowerShell — it creates UTF-16 encoded files that crash `python-dotenv`. Use the Python one-liner above, or create the `.env` file manually in a text editor (save as **UTF-8**, no BOM).

The backend runs at **http://localhost:8900**. Verify with:
```bash
curl http://localhost:8900
# {"message": "Server is running"}
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file (optional — defaults to http://localhost:8900)
# On Windows, use a text editor instead of echo to avoid encoding issues
python -c "open('.env','w').write('VITE_API_URL=http://localhost:8900\n')"

# Start dev server
npm run dev
```

The frontend runs at **http://localhost:5173**.

### Production Build

```bash
cd frontend
npm run build     # Output in dist/
npm run preview   # Preview the build locally
```

---

## API Reference

### `POST /calculate`

Process a handwritten math expression image.

**Request Body:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "dict_of_vars": { "x": "5", "y": "3" }
}
```

| Field | Type | Constraints | Description |
|---|---|---|---|
| `image` | `string` | Max 10MB, must include data URI prefix | Base64-encoded image (PNG or JPEG) |
| `dict_of_vars` | `object` | Max 50 keys, string keys (max 50 chars), scalar values | Previously assigned variables |

**Success Response (200):**
```json
{
  "message": "Image processed",
  "status": "success",
  "data": [
    { "expr": "2x + 3", "result": "13", "assign": false }
  ]
}
```

**Empty Response (200):**
```json
{
  "message": "Could not recognize any expressions",
  "status": "empty",
  "data": []
}
```

**Error Responses:**

| Status | Cause | Example `detail` |
|---|---|---|
| `400` | Invalid image format, corrupted image, bad base64 | `"Invalid base64 image data"` |
| `413` | Image payload exceeds 10MB | `"Image too large (max 10MB)"` |
| `422` | Pydantic validation failure (bad `dict_of_vars`) | `"Too many variables (max 50)"` |
| `502` | Gemini API failure (rate limit, key issue, network) | `"AI processing failed: ..."` |

**Response Fields:**

| Field | Type | Description |
|---|---|---|
| `expr` | `string` | The expression or variable name |
| `result` | `string` | Computed result (always string-normalized) |
| `assign` | `boolean` | `true` if this is a variable assignment |

### `GET /`

Health check endpoint.

```json
{"message": "Server is running"}
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `http://localhost:8900` | Backend URL |

---

## Configuration

### Server
Edit `backend/constants.py` to change:
- `SERVER_URL` (default: `localhost`)
- `PORT` (default: `8900`)
- `ENV` (default: `dev` — enables hot reload and permissive CORS)

### AI Model
Edit `backend/apps/calculator/utils.py` to change:
- Model name: `gemini-2.0-flash` — swap for any Gemini model ID
- Image max size: `MAX_IMAGE_SIZE` in `route.py` (default: 1024px)
- Max payload: `MAX_PAYLOAD_BYTES` in `route.py` (default: 10MB)

### Canvas Colors
Edit `frontend/src/constants.ts` to customize the 10-color drawing palette.

### Theme
Edit CSS variables in `frontend/src/index.css` under `.dark` to change the color scheme. The primary color is `262 83% 58%` (purple/violet).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `UnicodeDecodeError` or `OSError: Invalid argument` on startup | `.env` file is UTF-16 encoded (PowerShell `echo` default on Windows) | Recreate `.env` as UTF-8: `python -c "open('.env','w').write('GEMINI_API_KEY=your_key\n')"` |
| "Cannot reach server" | Backend not running | Run `python main.py` in the backend directory |
| "Request timed out" | Complex expression or slow network | Try a simpler drawing, check Gemini API status |
| "Could not recognize expression" | Drawing too messy or too small | Write larger, clearer characters |
| "AI processing failed" | Invalid API key or Gemini quota exceeded | Check `GEMINI_API_KEY` in `.env`, verify at Google AI Studio |
| "Image too large" | Drawing canvas is huge | Crop or simplify the drawing |
| Drawing looks blurry | Missing HiDPI support | Already handled — clear cache and reload |
| Touch drawing is jittery | Missing `touch-action: none` | Already handled in latest version |
| CORS error in browser | Backend CORS mismatch | In dev, `ENV=dev` allows all origins; in prod, add your domain to `main.py` |
| `FutureWarning: Python 3.9 past end of life` | Python 3.9 is deprecated by Google libraries | Upgrade to Python 3.10+ for full support |

---

## License

This project is for educational purposes.
