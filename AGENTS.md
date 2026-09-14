# Publication boundaries

Read docs/PUBLIC-SOURCE.md before publishing to GitHub.

The full development tree and its main commits are local. Do not push this full tree to the public origin. The user requested selected original source modules be omitted from the public distribution; scripts/public-source-manifest.json lists them. Generate public sources with scripts/export-public-source.mjs. Publish that generated tree to codex/public-source only. Publish a verified local dist build to codex/site only. These directories contain fresh git repositories, so do not accidentally stage or delete files in the full development tree.

GitHub Pages uses the compiled codex/site branch. The old Deploy workflow building remote main must stay disabled. Old remote main/history remain public; do not claim old code was removed. No history rewrite or repository deletion is authorized by this setup.

Gameplay quality takes priority. Maintain visible terrain sharpness and resolution. Do not proxy every map tile through n8n without measuring throughput and frame behavior. Current frontend tokens are client-visible; never claim GitHub Secrets, hashing or minification makes a client credential secret. Never print real credentials or commit .env.local. Future server-side migration needs separate validation.

Validate full private development with npm run build and browser tests relevant to changes before generating distributions.

Latest user decision on 2026-09-14: a dedicated n8n workflow on box.zakai.eu is authorized ONLY for terrain session admission and renewal. Do not deploy a separate service or use SSH: the user explicitly declined direct server installation. Tile downloads remain direct. Browser access is authorized and already signed in. Provider approval for a shared monthly pool of supporter accounts was confirmed by the user. The queue is KrukWer, GoraM, PawelekMega, main. Allocate against confirmed account usage, limit and billing period before each session dispatch; never switch accounts to evade burst limits. Unknown budgets must not be enabled in production. Do not claim global account protection unless other account usage is accounted for. Existing server/ is an uninstalled development alternative, excluded from public exports.
