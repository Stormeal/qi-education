# Dependency report, 2026-10-22

X7. Initial base `2780870`; shared main also received Claude's `bd74b1b` documentation/version commit during inspection. Node 22.13.0, npm 10.9.2, Windows. No shared services, secrets, push, or deployment.

## Commands and baseline

Ran `npm outdated --json` and `npm audit --json` separately with `--workspaces=false` for root, `--workspace api` for API, and `--workspace app` for app. Nonzero findings exit codes were captured, not treated as a tool crash. Registry metadata was also read for latest versions. Latest is not an approved update target.

Audit counts are affected package entries, not unique CVEs or demonstrated exploitation. Scopes overlap; do not add them together. Native Linux packages are locked but absent on Windows.

| Scope | Outdated entries | Low | Moderate | High | Critical | Total audit entries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| root | 0 | 0 | 0 | 0 | 2 | 2 |
| api | 11 | 2 | 3 | 5 | 1 | 11 |
| app | 20 | 3 | 13 | 21 | 3 | 40 |

Root outdated returned an empty object (exit 0), including a repeat with --prefer-online. Separate registry metadata nevertheless lists concurrently 10.0.6; it is included below. Concurrently also inherits a critical shell-quote finding. An empty outdated result is not evidence of vulnerability-free dependencies.

## Every outdated direct dependency

Current is installed at baseline inspection; wanted is the value reported by npm outdated. Latest below uses the separately fetched registry dist-tag, which differs from npm outdated for Angular and concurrently. The execution ledger records retained targets.

| Scope/package | Current | Wanted | Latest | Step to latest | Affects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| root: concurrently | 9.2.1 | 9.2.1 (outdated returned no entry) | 10.0.6 | major | Root dev process orchestration | Claude/Alex: assess major separately; prioritize compatible shell-quote remediation. |
| api: @mux/mux-node | 14.1.0 | 14.1.1 | 15.5.0 | major | API video SDK | Attempt 14.1.1 (patch); one package/family per verified commit. |
| api: @rolldown/binding-linux-x64-gnu | not installed; locked 1.0.0-rc.17 | 1.0.0-rc.17 | 1.2.15 | minor | API test bundler Linux binary | Keep exact bundler-matching pin; do not update independently. |
| api: @types/node | 25.6.0 | 25.9.9 | 26.6.5 | major | API Node compile-time declarations | Attempt 25.9.9 (minor); one package/family per verified commit. |
| api: dotenv | 17.4.2 | 17.4.2 | 18.0.8 | major | API environment loading | Defer major upgrade to Claude/Alex. |
| api: express | 5.2.1 | 5.3.0 | 5.3.0 | minor | API HTTP handling | Attempt 5.3.0 (minor); one package/family per verified commit. |
| api: googleapis | 171.4.0 | 171.4.0 | 187.0.0 | major | API feedback Sheets client | Defer major upgrade to Claude/Alex. |
| api: mongodb | 7.2.0 | 7.7.0 | 7.7.0 | minor | API storage driver | Attempt 7.7.0 (minor); one package/family per verified commit. |
| api: tsx | 4.21.0 | 4.23.15 | 4.23.15 | minor | API dev/import/maintenance CLI | Attempt 4.23.15 (minor); one package/family per verified commit. |
| api: typescript | 6.0.3 | 6.0.3 | 7.0.2 | major | TypeScript compiler | Defer major upgrade to Claude/Alex. |
| api: vitest | 4.1.5 | 4.1.12 | 5.0.5 | major | Test runner | Attempt 4.1.12 (patch); one package/family per verified commit. |
| api: zod | 4.3.6 | 4.6.7 | 4.6.7 | minor | API validation | Attempt 4.6.7 (minor); one package/family per verified commit. |
| app: @angular/build | 21.2.10 | 21.2.10 | 22.2.4 | major | App build pipeline | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/cli | 21.2.10 | 21.2.10 | 22.2.4 | major | App CLI and development tools | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/common | 21.2.10 | 21.2.10 | 22.2.3 | major | App common framework APIs | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/compiler | 21.2.10 | 21.2.10 | 22.2.3 | major | App template compiler | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/compiler-cli | 21.2.10 | 21.2.10 | 22.2.3 | major | App ahead-of-time compilation | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/core | 21.2.10 | 21.2.10 | 22.2.3 | major | App framework runtime | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/forms | 21.2.10 | 21.2.10 | 22.2.3 | major | App form handling | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/platform-browser | 21.2.10 | 21.2.10 | 22.2.3 | major | App browser rendering | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @angular/router | 21.2.10 | 21.2.10 | 22.2.3 | major | App routing | Claude/Alex: review Angular 22 migration separately; first assess the 21.2 patch family reported by npm outdated. App checks and supported Node/TypeScript versions required. |
| app: @mux/mux-player | 3.13.0 | 3.14.0 | 3.14.0 | minor | App video playback | Defer to Claude/Alex; no app upgrades in X7. |
| app: @ng-icons/core | 33.2.2 | 33.4.0 | 36.1.0 | major | App icons | Defer to Claude/Alex; no app upgrades in X7. |
| app: @ng-icons/lucide | 33.2.2 | 33.4.0 | 36.1.0 | major | App icon data | Defer to Claude/Alex; no app upgrades in X7. |
| app: @rollup/rollup-linux-x64-gnu | not installed; locked 4.60.2 | 4.60.2 | 4.65.0 | minor | App build Linux binary | Defer to Claude/Alex; no app upgrades in X7. |
| app: @tailwindcss/postcss | 4.2.4 | 4.3.3 | 4.3.3 | minor | App CSS build integration | Defer to Claude/Alex; no app upgrades in X7. |
| app: jsdom | 28.1.0 | 28.1.0 | 30.1.3 | major | App browser simulation | Defer to Claude/Alex; no app upgrades in X7. |
| app: postcss | 8.5.13 | 8.5.31 | 8.5.31 | patch | CSS/build tooling | Defer to Claude/Alex; no app upgrades in X7. |
| app: prettier | 3.8.3 | 3.9.10 | 3.9.10 | minor | App formatting | Defer to Claude/Alex; no app upgrades in X7. |
| app: tailwindcss | 4.2.4 | 4.3.3 | 4.3.3 | minor | App CSS compiler | Defer to Claude/Alex; no app upgrades in X7. |
| app: typescript | 5.9.3 | 5.9.3 | 7.0.2 | major | TypeScript compiler | Defer to Claude/Alex; no app upgrades in X7. |
| app: vitest | 4.1.5 | 4.1.12 | 5.0.5 | major | Test runner | Defer to Claude/Alex; no app upgrades in X7. |

API @types/node stays on major 25, already used by the project. Node runtime remains 22; type declarations do not prove availability of newer Node APIs. Consider aligning these separately. Pre-1.0 minor updates and prerelease-to-stable moves need compatibility review rather than treating them as ordinary safe patches.

## Every package named by baseline audit

All 42 distinct package names from the three audit results are included. Versions include all affected locked copies. Some direct-package findings are propagated through dependencies rather than their own advisories. Registry latest may be a major or still contain vulnerable dependencies.

| Package | Scopes | Affected installed/locked versions | Latest | Step(s) | Severity | Affects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| @angular/build | app | 21.2.10 | 22.2.4 | major | high | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/cli | app | 21.2.10 | 22.2.4 | major | high | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/common | app | 21.2.10, 21.2.12 | 22.2.3 | major | high | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/compiler | app | 21.2.10 | 22.2.3 | major | high | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/compiler-cli | app | 21.2.10 | 22.2.3 | major | moderate | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/core | app | 21.2.10, 21.2.12 | 22.2.3 | major | high | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/forms | app | 21.2.10 | 22.2.3 | major | moderate | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/platform-browser | app | 21.2.10 | 22.2.3 | major | moderate | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @angular/router | app | 21.2.10 | 22.2.3 | major | high | App framework dependency | Claude/Alex: update owning app/tooling family and run app checks. |
| @babel/core | app | 7.29.0 | 8.0.7 | major | low | App compilation | Claude/Alex: update owning app/tooling family and run app checks. |
| @hono/node-server | app | 1.19.14 | 2.1.5 | major | moderate | App CLI MCP HTTP adapter | Claude/Alex: update owning app/tooling family and run app checks. |
| @modelcontextprotocol/sdk | app | 1.26.0 | 1.32.1 | minor | high | App CLI MCP tooling | Claude/Alex: update owning app/tooling family and run app checks. |
| @sigstore/core | app | 3.2.0 | 4.0.1 | major | moderate | App package signature tooling | Claude/Alex: update owning app/tooling family and run app checks. |
| @sigstore/verify | app | 3.1.0 | 4.1.2 | major | moderate | App package verification | Claude/Alex: update owning app/tooling family and run app checks. |
| @vitest/mocker | api, app | 4.1.5 | 5.0.5 | major | moderate | Test mocking server | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| argparse | app | 1.0.10 | 3.0.3 | major | moderate | App DOCX import dependency | Do not accept audit's proposed mammoth 0.3.29 downgrade. Review a current-family transitive/upstream remedy and CV import regressions. |
| baseline-browser-mapping | app | 2.10.24 | 2.11.30 | minor | moderate | App browser targeting | Claude/Alex: update owning app/tooling family and run app checks. |
| body-parser | api, app | 2.2.2 | 2.4.0 | minor | low | HTTP request parsing | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| brace-expansion | app | 5.0.6 | 5.0.12 | patch | high | Build glob handling | Claude/Alex: update owning app/tooling family and run app checks. |
| browserslist | app | 4.28.2 | 4.29.4 | minor | high | App browser targets | Claude/Alex: update owning app/tooling family and run app checks. |
| concurrently | root | 9.2.1 | 10.0.6 | major | critical | Root dev process orchestration | Root owner: assess major separately and address shell-quote without audit --force. |
| esbuild | api, app | 0.27.7, 0.27.3 | 0.28.2 | minor | low | API CLI / app transforms | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| fast-uri | app | 3.1.2 | 4.2.3 | major | high | App URI/schema parsing | Claude/Alex: update owning app/tooling family and run app checks. |
| hono | app | 4.12.18 | 4.13.13 | minor | high | App CLI MCP server | Claude/Alex: update owning app/tooling family and run app checks. |
| http-cache-semantics | app | 4.2.0 | 4.3.0 | minor | high | App package HTTP caching | Claude/Alex: update owning app/tooling family and run app checks. |
| immutable | app | 5.1.5 | 5.1.9 | patch | high | App Sass/build structures | Claude/Alex: update owning app/tooling family and run app checks. |
| ip-address | api, app | 10.2.0 | 10.7.4 | minor | high | Proxy/address handling | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| mammoth | app | 1.13.0 | 1.13.0 | none | moderate | App DOCX CV extraction | Do not accept audit's proposed mammoth 0.3.29 downgrade. Review a current-family transitive/upstream remedy and CV import regressions. |
| nanoid | api, app | 3.3.12 | 6.0.2 | major | high | Build/test identifiers | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| pacote | app | 21.3.1 | 22.0.1 | major | high | App CLI package fetching | Claude/Alex: update owning app/tooling family and run app checks. |
| piscina | app | 5.1.4 | 5.3.2 | minor | critical | App build worker pool | Claude/Alex: update owning app/tooling family and run app checks. |
| postcss | api, app | 8.5.13 | 8.5.31 | patch | high | CSS/build tooling | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| proxy-addr | api, app | 2.0.7 | 2.0.8 | patch | critical | Trusted proxy address parsing | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| qs | api, app | 6.15.1 | 6.16.1 | minor | moderate | HTTP query parsing | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| shell-quote | root | 1.8.3 | 1.12.0 | minor | critical | Root dev command quoting | Root owner: refresh supported transitive versions; no root update here. |
| sigstore | app | 4.1.0 | 5.0.0 | major | high | App signature verification | Claude/Alex: update owning app/tooling family and run app checks. |
| source-map-js | api, app | 1.2.1 | 1.2.2 | patch | high | Build/test source maps | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| sprintf-js | app | 1.0.3 | 1.1.3 | minor | moderate | App DOCX import formatting | Do not accept audit's proposed mammoth 0.3.29 downgrade. Review a current-family transitive/upstream remedy and CV import regressions. |
| tar | app | 7.5.15 | 7.5.22 | patch | critical | App CLI archive extraction | Claude/Alex: update owning app/tooling family and run app checks. |
| undici | app | 7.24.4, 6.25.0 | 8.12.3 | major | high | App tooling HTTP client | Claude/Alex: update owning app/tooling family and run app checks. |
| vite | api, app | 8.0.10, 7.3.2 | 8.3.5 | minor, major | high | API test / app dev/build tooling | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |
| vitest | api, app | 4.1.5 | 5.0.5 | major | moderate | Test runner | Try owning API family update; preserve app copies. Remaining app paths need Claude/Alex. |

### Audit advisory evidence

These links come from npm audit; severity does not establish production reachability.

- **@angular/build:** propagated dependency finding; see the owning family above.
- **@angular/cli:** propagated dependency finding; see the owning family above.
- **@angular/common:** [GHSA-48r7-hpm6-gfxm](https://github.com/advisories/GHSA-48r7-hpm6-gfxm), [GHSA-39pv-4j6c-2g6v](https://github.com/advisories/GHSA-39pv-4j6c-2g6v), [GHSA-p3vc-36g9-x9gr](https://github.com/advisories/GHSA-p3vc-36g9-x9gr), [GHSA-q6f4-qqrg-jv6x](https://github.com/advisories/GHSA-q6f4-qqrg-jv6x), [GHSA-jhpw-976m-542j](https://github.com/advisories/GHSA-jhpw-976m-542j), [GHSA-p297-fm68-3q8c](https://github.com/advisories/GHSA-p297-fm68-3q8c)
- **@angular/compiler:** [GHSA-58w9-8g37-x9v5](https://github.com/advisories/GHSA-58w9-8g37-x9v5), [GHSA-f3m7-gqxr-g87x](https://github.com/advisories/GHSA-f3m7-gqxr-g87x), [GHSA-jj27-h5hq-8x99](https://github.com/advisories/GHSA-jj27-h5hq-8x99), [GHSA-hh8m-fm6v-7cvg](https://github.com/advisories/GHSA-hh8m-fm6v-7cvg)
- **@angular/compiler-cli:** propagated dependency finding; see the owning family above.
- **@angular/core:** [GHSA-f3m7-gqxr-g87x](https://github.com/advisories/GHSA-f3m7-gqxr-g87x), [GHSA-692r-grfm-v8x7](https://github.com/advisories/GHSA-692r-grfm-v8x7), [GHSA-rgjc-h3x7-9mwg](https://github.com/advisories/GHSA-rgjc-h3x7-9mwg), [GHSA-jj27-h5hq-8x99](https://github.com/advisories/GHSA-jj27-h5hq-8x99), [GHSA-hh8m-fm6v-7cvg](https://github.com/advisories/GHSA-hh8m-fm6v-7cvg)
- **@angular/forms:** propagated dependency finding; see the owning family above.
- **@angular/platform-browser:** propagated dependency finding; see the owning family above.
- **@angular/router:** [GHSA-ff3f-86qr-9cv3](https://github.com/advisories/GHSA-ff3f-86qr-9cv3), [GHSA-62vg-58rm-qff7](https://github.com/advisories/GHSA-62vg-58rm-qff7), [GHSA-57xq-rjx2-v5xh](https://github.com/advisories/GHSA-57xq-rjx2-v5xh)
- **@babel/core:** [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8)
- **@hono/node-server:** [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9)
- **@modelcontextprotocol/sdk:** [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h), [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw), [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw), [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453), [GHSA-rvq5-wwqv-78pq](https://github.com/advisories/GHSA-rvq5-wwqv-78pq)
- **@sigstore/core:** [GHSA-jfc7-64v2-mr8c](https://github.com/advisories/GHSA-jfc7-64v2-mr8c)
- **@sigstore/verify:** [GHSA-xgjw-pm74-86q4](https://github.com/advisories/GHSA-xgjw-pm74-86q4)
- **@vitest/mocker:** [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)
- **argparse:** propagated dependency finding; see the owning family above.
- **baseline-browser-mapping:** [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)
- **body-parser:** [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6)
- **brace-expansion:** [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)
- **browserslist:** [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g)
- **concurrently:** propagated dependency finding; see the owning family above.
- **esbuild:** [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)
- **fast-uri:** [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx), [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7), [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc), [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6), [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3), [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)
- **hono:** [GHSA-xrhx-7g5j-rcj5](https://github.com/advisories/GHSA-xrhx-7g5j-rcj5), [GHSA-3hrh-pfw6-9m5x](https://github.com/advisories/GHSA-3hrh-pfw6-9m5x), [GHSA-f577-qrjj-4474](https://github.com/advisories/GHSA-f577-qrjj-4474), [GHSA-2gcr-mfcq-wcc3](https://github.com/advisories/GHSA-2gcr-mfcq-wcc3), [GHSA-rv63-4mwf-qqc2](https://github.com/advisories/GHSA-rv63-4mwf-qqc2), [GHSA-wgpf-jwqj-8h8p](https://github.com/advisories/GHSA-wgpf-jwqj-8h8p), [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc), [GHSA-wwfh-h76j-fc44](https://github.com/advisories/GHSA-wwfh-h76j-fc44), [GHSA-j6c9-x7qj-28xf](https://github.com/advisories/GHSA-j6c9-x7qj-28xf), [GHSA-xgm2-5f3f-mvvc](https://github.com/advisories/GHSA-xgm2-5f3f-mvvc), [GHSA-hvrm-45r6-mjfj](https://github.com/advisories/GHSA-hvrm-45r6-mjfj), [GHSA-w62v-xxxg-mg59](https://github.com/advisories/GHSA-w62v-xxxg-mg59), [GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239), [GHSA-f23p-vx2j-j53r](https://github.com/advisories/GHSA-f23p-vx2j-j53r), [GHSA-79qm-7rj5-m7r9](https://github.com/advisories/GHSA-79qm-7rj5-m7r9), [GHSA-54fx-42gc-7vw4](https://github.com/advisories/GHSA-54fx-42gc-7vw4), [GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv), [GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc), [GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx), [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv), [GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7)
- **http-cache-semantics:** [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
- **immutable:** [GHSA-xvcm-6775-5m9r](https://github.com/advisories/GHSA-xvcm-6775-5m9r), [GHSA-v56q-mh7h-f735](https://github.com/advisories/GHSA-v56q-mh7h-f735)
- **ip-address:** [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr), [GHSA-4xrf-jv44-h6hh](https://github.com/advisories/GHSA-4xrf-jv44-h6hh), [GHSA-22jq-vg5j-6vgg](https://github.com/advisories/GHSA-22jq-vg5j-6vgg), [GHSA-rpw4-54j3-4h4q](https://github.com/advisories/GHSA-rpw4-54j3-4h4q), [GHSA-2vr4-cq9g-pvrc](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc), [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv), [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw)
- **mammoth:** propagated dependency finding; see the owning family above.
- **nanoid:** [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
- **pacote:** [GHSA-w4pp-8pjf-rmxw](https://github.com/advisories/GHSA-w4pp-8pjf-rmxw)
- **piscina:** [GHSA-x9g3-xrwr-cwfg](https://github.com/advisories/GHSA-x9g3-xrwr-cwfg), [GHSA-67c8-pqhq-4rmx](https://github.com/advisories/GHSA-67c8-pqhq-4rmx)
- **postcss:** [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)
- **proxy-addr:** [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)
- **qs:** [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26), [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)
- **shell-quote:** [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p), [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv)
- **sigstore:** [GHSA-52v5-jr5w-gjxr](https://github.com/advisories/GHSA-52v5-jr5w-gjxr)
- **source-map-js:** [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- **sprintf-js:** [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
- **tar:** [GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh), [GHSA-w8wr-v893-vjvp](https://github.com/advisories/GHSA-w8wr-v893-vjvp), [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w), [GHSA-gvwx-54wh-qm9j](https://github.com/advisories/GHSA-gvwx-54wh-qm9j), [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m)
- **undici:** [GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g), [GHSA-p88m-4jfj-68fv](https://github.com/advisories/GHSA-p88m-4jfj-68fv), [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q), [GHSA-hm92-r4w5-c3mj](https://github.com/advisories/GHSA-hm92-r4w5-c3mj), [GHSA-g8m3-5g58-fq7m](https://github.com/advisories/GHSA-g8m3-5g58-fq7m), [GHSA-pr7r-676h-xcf6](https://github.com/advisories/GHSA-pr7r-676h-xcf6), [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524), [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272), [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5), [GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54), [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm), [GHSA-35p6-xmwp-9g52](https://github.com/advisories/GHSA-35p6-xmwp-9g52), [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v), [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x), [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r), [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5), [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm), [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j), [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968), [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3), [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv), [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq)
- **vite:** [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)
- **vitest:** [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)

## Compatibility and scope

- No app dependency declarations or major versions are updated. Only required product-version bumps touch app files. A traversal of the original app lockfile dependency, optional, and peer graph checks that API updates do not silently update app dependency versions.
- The initial `npm ls --workspace app --all` already reported extraneous @napi-rs/wasm-runtime and @tybys/wasm-util, and missing @emnapi/core/runtime beneath that WASM package. This installed-tree issue predates X7 and is not repaired here; a lockfile graph comparison does not claim the installed app tree is clean.
- Linux native optional pins must match the bundler. Windows tests do not verify Linux execution.
- Mux 14.1.1 reports a rename/deprecation to @mux/ts. The [official migration guide](https://github.com/muxinc/mux-ts/blob/main/MIGRATION.md) belongs to a separately reviewed migration.
- [Express 5.3.0](https://github.com/expressjs/express/releases/tag/v5.3.0) raises body-parser/proxy-addr/qs minimums. Existing parsing/auth/rate-limit regressions must pass.
- [MongoDB 7.7.0](https://github.com/mongodb/node-mongodb-native/releases/tag/v7.7.0) includes OIDC retry and dependency fixes. Its Node >=20.19.0 requirement admits this Node 22.13.0 runtime. Real database behavior is unverified.
- [Vitest 4.1.12](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12) backports mock hardening; preserve the separate Angular test stack.

## Execution ledger

Each retained update runs `npm run api:test` and `npm run api:build` before committing. The two INV-004 expected failures are existing documented behavior, not update regressions. No `npm audit fix --force` is used.

| Package/family | Before to target | Result | Full API tests | API build | Commit |
| --- | --- | --- | --- | --- | --- |
| @mux/mux-node | 14.1.0 to 14.1.1 | Retained; app graph unchanged | 2,431 passed + 2 expected failures | Pass | `ddce9c3` |
| express | 5.2.1 to 5.3.0 | Reverted before commit: shared app tooling changed and content-disposition/content-type moved to major 2 | 2,431 passed + 2 expected failures before rollback | Pass before rollback | No dependency change retained |
| mongodb family | 7.2.0 to 7.7.0 | Retained; BSON 7.3.3, saslprep 1.6.1, connection-string-url 7.0.2; app graph unchanged | 2,431 passed + 2 expected failures | Pass | `c2ffc4a` |
| @types/node family | 25.6.0 to 25.9.9 | Retained under api/ with undici-types 7.24.6; app graph unchanged | 2,431 passed + 2 expected failures | Pass | `178dee2` |
| tsx family | 4.21.0 to 4.23.15 | Retained; API esbuild 0.28.2; app graph unchanged; typed CLI smoke passed | 2,431 passed + 2 expected failures | Pass | This tsx update commit |

The Express attempt passed behavioral checks, but was outside the conservative no-major/app
scope once its resolved transitive graph was inspected. Only this attempt's uncommitted changes
were reversed; the installed tree was then reconciled to the original lock. The full app graph
(including development dependencies) again matches baseline. Recommend Claude/Alex review this
security-related family update with app tooling and the transitive major changes together.

## Final state and handoff

Remaining candidates and final re-audit pending. Real MongoDB, Stripe, Mux, Sheets, Brevo, GitHub and Linux deployment integrations are not exercised. App/root updates and majors remain with Claude and Alex.
