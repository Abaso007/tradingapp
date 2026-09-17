# Live trading corrections — September 2026

## Runtime configuration

- `ALPACA_OWNER_USER_ID`: required to let the intended application user use server-held Alpaca credentials. All other users need their own complete pair. Settings keys take precedence; pairs are never mixed.
- `ALLOW_REGISTRATION=false` (default): registrations disabled. Existing login remains available.
- `BIND_HOST=127.0.0.1` (default): serve through nginx; do not expose port 3000.
- `REBALANCE_SCHEDULER_ENABLED=false`: maintenance switch for the portfolio scheduler. Remove or set true after reconciliation and deployment checks.
- Preserve `COMPOSER_ASOF_MODE=previous-close`, current budget/cash limit and window. This change does **not** claim intraday Composer parity or change the strategy's signal policy.
- Honor the definition's `:rebalance-threshold` (BB-XM: 0.069) using percentage-point differences between target weights and strategy holdings plus assigned cash. Within the corridor, retain holdings. Exceeding the invested budget or closing the strategy takes precedence, including sales smaller than the old 0.01-share tolerance. Changes from a 100% ETF target to another exceed the corridor. See [Composer's threshold definition](https://help.composer.trade/article/76-threshold-trading).
- Price history fallbacks and caches must support the requested convention. Tiingo's `adjClose` includes both splits and dividends, so split-only/dividend-only requests use other providers. Stooq is never used for dividend-adjusted requests. Missing compatible data stops evaluation. See [Tiingo EOD documentation](https://www.tiingo.com/documentation/end-of-day).

## Execution and recovery

Alpaca and Polymarket have separate scheduler queues. Each Alpaca operation also holds a renewable Mongo lease keyed by broker credentials. An expired lease can be reclaimed after five minutes; an operation must confirm ownership before persisting or submitting. Never manually clear a lease while its worker is running.

The portfolio stores a durable cycle baseline and order intents before submission. Broker UUIDs and client IDs are separate. Only confirmed cumulative `filled_qty` and `filled_avg_price` affect holdings, cash and realized P&L. Recovery replays the baseline and searches unknown orders by client ID. It never blindly resubmits an ambiguous POST. An unresolved 404 requires investigation; automatic retries are limited and pause new trading after three failures, while pending-order reconciliation continues.

Sells must be confirmed before purchases; purchases use refreshed broker cash/buying power, strategy allocation and a reserve of 0.5% (minimum $0.05). This reserve reduces, but cannot guarantee, market-order execution costs. Account open orders, inconsistent positions, unknown market clock and stale live sizing prices block submissions. The live evaluator refuses an incomplete indicator universe. A personal holding in a new target symbol also blocks trading rather than being adopted. Multiple portfolios sharing a symbol require explicit allocation support before being used.

Creation is queued before orders are sent. Closure retains the portfolio and definition, liquidates only its tracked stocks through the journal and archives after confirmation. Pause/resume is available in the dashboard. Legacy AI-fund trading is paper-only; live strategy operations use the journaled path.

## Accounting migration

`node server/scripts/reconcile_alpaca_portfolio.js --strategy ID --universe SOXL,SOXS,SPXU,UPRO,SQQQ,TQQQ,UVXY,VIXY --after 2026-02-11 --include-account-fees --out /private/plan.json`

This command only reads broker data and writes a private local plan. Inspect the proposed stocks, cash ceiling, actual realized P&L and unallocated activity IDs. Apply with the same arguments plus `--apply --plan-hash HASH`. Apply checks the inspected plan and portfolio version under the broker lease. Keep the plan as a before/after backup; it contains financial data and must not be committed.

Configure the universe only when its holdings and fills belong exclusively to that strategy. Account fees are attributed only with the explicit flag and no unrelated fills during the period. Ambiguous fees remain unallocated; unsupported corporate actions or quantity discrepancies block reconciliation. NVDA and its dividends are excluded for BB-XM. Daily strategy execution repeats reconciliation from Alpaca activities and stores immutable, idempotent ledger rows in `strategyLedger`.

The old initial-investment amount is retained for traceability and no longer grows with reinvested gains. Monetary P&L uses actual fills, dividends and fees. Percentages are withheld until net contributions are verified, because account cash is shared. Old equity snapshots remain historical app estimates; they are not silently rewritten as verified broker history. New snapshots follow reconciled balances.

## HTTPS and deployment

`ops/enable-ip-https.sh PUBLIC_IP` installs a Let's Encrypt IP certificate using Certbot and configures nginx. It backs up the original nginx configuration, keeps HTTP-01 validation available, redirects other HTTP traffic to HTTPS, checks renewal in staging and installs a reload hook. IP certificates are short-lived; the renewal timer is required. See [Let's Encrypt's Certbot instructions](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/).

CI runs backend regression tests and builds the client before deploying. Both dependency trees use lockfiles and `npm ci`; third-party SSH/SCP actions are pinned to commits. `/api/ready` verifies MongoDB readiness. It is not an end-to-end broker trading test; post-deploy verification must use broker GETs, authenticated portfolio reads, scheduler logs and the order journal. Never send a test order to a live account.

## Dependencies

The unused client Alpaca SDK and the old server SDK were removed. The server uses its existing Axios REST path plus a small legacy read adapter; this avoids migrating to the incompatible SDK 4 API. Compatible dependency patches and a patched `ws` 8 override remove the server's high/critical findings.

Client overrides use the existing SVGR 7 loader throughout React Scripts, resolve-url-loader 5/PostCSS 8, patched serialize-javascript, Underscore and once. The production build validates compatibility. As of September 17, `npm audit` reports no high/critical findings in either tree; the client has six moderate entries and the server has fourteen low/two moderate entries (counts include transitive propagation).

Remaining frontend entries concern React Router and the local webpack development server. Production serves the static build through nginx, with no webpack dev server or server-side React hydration. Routes use application-owned paths; do not add untrusted navigation destinations before upgrading the router. The patched router requires React 18, while this client uses React 17. Treat React/router and React Scripts replacement as a coordinated migration with browser regression coverage; `npm audit fix --force` currently proposes react-scripts 0.0.0 and must not be used. Ethers/cron major upgrades are also outstanding. These residual advisories are documented, not declared fixed.
