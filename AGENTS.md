# Publication boundaries

Read docs/PUBLIC-SOURCE.md before publishing to GitHub.

The full development tree and its main commits are local. Do not push this full tree to the public origin. The user requested six original source modules be omitted from the public distribution; scripts/public-source-manifest.json lists them. Generate public sources with scripts/export-public-source.mjs. Publish that generated tree to codex/public-source only. Publish a verified local dist build to codex/site only. These directories contain fresh git repositories, so do not accidentally stage or delete files in the full development tree.

GitHub Pages uses the compiled codex/site branch. The old Deploy workflow building remote main must stay disabled. Old remote main/history remain public; do not claim old code was removed. No history rewrite or repository deletion is authorized by this setup.

Gameplay quality takes priority. Maintain visible terrain sharpness and resolution. Do not proxy every map tile through n8n without measuring throughput and frame behavior. Current frontend tokens are client-visible; never claim GitHub Secrets, hashing or minification makes a client credential secret. Never print real credentials or commit .env.local. Future server-side migration needs separate validation.

Validate full private development with npm run build and browser tests relevant to changes before generating distributions.

Latest user decision on 2026-09-14: do not deploy n8n integration. Keep the game terrain requests direct. The n8n architecture document is inactive reference material. Do not resume n8n credential recovery or deployment unless the user explicitly requests it again.
