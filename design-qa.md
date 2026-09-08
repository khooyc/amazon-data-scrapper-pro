# Design QA

**Source visual truth**

- Source: local render of the established `github-sync-amazon-excel/docs` extension landing page at `http://127.0.0.1:8001/`.
- Implementation: local render of `docs/index.html` at `http://127.0.0.1:8002/`.
- Source screenshot: Codex in-app browser comparison capture (source image, first frame), 624 × 616 pixels.
- Implementation screenshot: Codex in-app browser comparison capture (implementation image, second frame), 624 × 616 pixels.
- CSS viewport: 624 × 616 CSS pixels; same browser surface and default page state for both captures.
- Density normalization: none required; both captures came from the same browser surface in the same comparison input.
- State: top of landing page, mobile navigation closed.

**Findings**

- No actionable P0, P1, or P2 findings remain.
- Typography: the implementation preserves the reference hierarchy, optical weight, compact navigation, large wrapped display heading, muted supporting copy, and full-width mobile CTA. IBM Plex Sans and IBM Plex Mono intentionally extend the extension's own interface typography into the marketing site.
- Spacing and layout: the reference's generous whitespace and stacked mobile hero are preserved. Desktop now places the article in a dedicated content column beside persistent section navigation; compact viewports collapse cleanly to an off-canvas contents drawer without horizontal overflow.
- Colors and tokens: the shared white/ink/amber structure is retained. The darker charcoal surfaces, restrained green/blue accents, and amber labels intentionally reflect the extension UI.
- Image quality: the generated hero is sharp, correctly cropped inside the 3:2 frame, unbranded, and visually consistent with the extension's dark research-console style. The supplied project icon is used directly for brand marks.
- Copy and content: claims match version 2.1, the manifest permissions, supported marketplaces, available fields, developer-mode distribution, and Excel/CSV behavior documented in the repository.

**Full-view comparison evidence**

- Source and implementation were emitted together from the same browser viewport. Both show the same information order above the fold: compact brand header, high-contrast product promise, explanatory copy, and primary install action.
- The implementation intentionally adds the version eyebrow and changes the accent from orange to the extension's amber token; neither change reduces hierarchy or fidelity to the established site family.

**Focused region comparison evidence**

- Mobile hero: compared together at 624 × 616. Heading scale, wrapping, copy width, button sizing, and header density are aligned with the reference.
- Desktop hero: separately inspected at the same desktop browser surface for both pages; the two-column layout, image frame, margins, border radius, and headline-to-media balance are consistent.
- Supporting sections were inspected in the rendered implementation for card alignment, list rhythm, responsive stacking, and contrast. Additional source-region crops were not needed because the shared design language is implemented with the same structural patterns and tokens rather than a pixel-for-pixel content clone.

**Comparison History**

- Iteration 3 — user-requested navigation restructure: the top navigation competed with the parent website's own navigation. Fix: replaced it with a sticky, article-style left sidebar containing the page outline and actions; compact widths use a dismissible Contents drawer. Post-fix evidence: desktop browser capture shows the 248px sidebar beside the full hero, the sidebar remains at top 0 after scrolling, and the 760px test confirms the drawer opens, closes after selection, updates the URL hash, and releases the body scroll lock.
- Iteration 2 — P2 hero artwork crop: the forced 3:2 presentation ratio trimmed the generated image because its natural ratio is 1568:1003. Fix: removed the forced ratio and switched the image to natural height with `object-fit: contain`. Post-fix evidence: browser measurements report matching natural and rendered ratios of 1.563, showing the complete artwork at 594 × 380 on mobile.
- Iteration 1 — P2 mobile privacy header crowding: the Back to website CTA consumed too much width and forced the brand onto three lines. Fix: shortened the label to Website and added a mobile width override. Post-fix evidence: the brand remains on one line and the CTA fits alongside it.
- Iteration 1 — P2 hero vertical offset on desktop: center alignment placed the headline too low relative to the hero image. Fix: changed the grid to top alignment with a controlled 54px desktop copy offset and removed that offset below 1000px. Post-fix evidence: the desktop headline and visual now begin as one balanced composition; mobile begins immediately below the header.
- Iteration 1 — P2 empty dialog image source: the closed lightbox contained an empty image source and appeared in the broken-image check. Fix: set the generated hero as the initial dialog source. Post-fix evidence: browser evaluation reports zero broken images.

**Primary Interactions Tested**

- Mobile navigation opens and closes, exposes all navigation links, and resets after selection.
- Desktop article navigation remains sticky while the content scrolls.
- Hero image opens in a modal preview and the close control is present.
- FAQ disclosure opens successfully.
- Privacy page loads and returns to the website.
- Browser console checked after interactions: no warnings or errors.

**Implementation Checklist**

- [x] Responsive landing page and mobile navigation
- [x] Functional image lightbox and FAQ disclosures
- [x] Local privacy overview and canonical policy link
- [x] GitHub download, source, license, support, and install links
- [x] SEO metadata, sitemap, robots file, and `.nojekyll`
- [x] Generated hero asset and supplied icon in project-local paths

**Follow-up Polish**

- P3: replace the GitHub source ZIP CTA with a Chrome Web Store URL if a public listing becomes available.

final result: passed
