# Office browser demo

Open `dev/office-demo/index.html` with `ao preview dev/office-demo/index.html` from the repository workspace, or serve the repository root with any local static file server and open `/dev/office-demo/`. The `production-src` symlink points to the extension's source directory; the page imports the production `renderHtml`, `office-client.js`, `office-world.js`, and `office.css` modules without maintaining a copy.

This developer-only page lives outside `.github/extensions/pixel-agents-canvas`, so it is not part of the extension package or runtime. Every person, session, title, event, source status, and preference in the page is invented mock data. Provider buttons are disabled, an in-memory bridge handles only `/state` and `/preferences`, and the rendered iframe uses `connect-src 'none'`; it does not load provider adapters, call host APIs, use credentials, or make external network connections.

Use the visible scenario list or selector for deterministic named states. **Next** advances through the list, **Play** cycles it, and **Random** starts a reproducible shuffle for the entered seed. The coverage labels identify the states represented. The preview width and reduced-motion controls exercise the same production renderer at narrow and wide sizes.
