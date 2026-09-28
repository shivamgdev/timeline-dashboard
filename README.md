# Timeline Dashboard

React 18 + TypeScript + Vite + MUI v6.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
cp .env.example .env.local
# set VITE_API_URL in .env.local to the backend base URL (no trailing slash, no /api prefix)
npm run dev
```

## Scripts

| Command             | Description                       |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the dev server              |
| `npm test`          | Run the unit tests (Vitest)       |
| `npm run typecheck` | Type-check the project            |
| `npm run lint`      | Lint the project                  |
| `npm run build`     | Type-check and build for production |
| `npm run preview`   | Serve the production build        |

See `NOTES.md` for design notes (session handling, chart performance, time handling, assumptions) and Netlify deployment settings.
