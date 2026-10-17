# Phase 0 rendering-scale check

**Checked:** 2026-10-17. **Target:** 100 sessions / 300 agents, as agreed for Phase 0.

## Method

Rendered the existing production `renderHtml()` implementation from `.github/extensions/pixel-agents-canvas/extension.mjs` in desktop Chrome 152.0.7977.84 through local Playwright. A temporary test-only fixture supplied 300 distinct synthetic agent entries grouped across 100 session labels; no fixture data or benchmark code was added to the product. The fixture was not presented as live activity and was not written into the extension's session store. The browser loaded the exact renderer HTML, waited for two animation frames, checked all rendered cards and names, collected Chrome DevTools Performance metrics, and repeated five times at 1280×900. A separate pass used a 390×844 viewport to check horizontal overflow.

The timed interval is page `set_content(wait_until="load")` plus two animation frames; it is a local renderer smoke/scale measurement, not a production user-perceived latency guarantee. It does not include provider discovery, extension startup, a live 100-session dataset, accessibility review, or screen-reader performance.

## Results

| Metric | Result |
|---|---:|
| Agent entries supplied | 300 across 100 session labels |
| Rendered cards / unique agent names | 300 / 300 |
| Desktop load + two frames (5 runs) | 49.01, 50.49, 46.96, 68.29, 57.29 ms |
| Median / min–max | 50.49 ms / 46.96–68.29 ms |
| Browser-reported JS heap after render | 1,566,232 bytes |
| DOM nodes / layout count | 4,001 / 1 |
| Page errors | None |
| 390 px viewport horizontal overflow | None (document width 390 px) |

The 300 records are all rendered: no list cap, sample substitution, or omission was involved. At 390 px the page is long (31,889 px) but retains the full roster without horizontal overflow.

## Conclusion and boundary

The current renderer handles the agreed 100-session/300-agent scale in this local synthetic-data smoke test; the scale gate is satisfied for renderer capacity at that target. This is not evidence that Codex can discover 100 live sessions in a representative environment or that all accessibility/performance acceptance criteria are satisfied. Preserve those as product verification work. Test fixture files and screenshots are session artifacts, not repository/product files.
