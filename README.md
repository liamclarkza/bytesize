# Bytesize

A fast, visual disk-space analyzer for macOS. Scan any folder or volume, explore it as an interactive sunburst chart, and move what you don't need to the Trash.

Built with [Tauri v2](https://v2.tauri.app/), Rust, React and TypeScript.

## Requirements

- macOS
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- Xcode Command Line Tools (`xcode-select --install`)

## Getting started

```bash
git clone https://github.com/liamclarkza/bytesize.git
cd bytesize
npm install
npm run tauri dev
```

## Building

```bash
npm run tauri build
```

The `.app` and `.dmg` are written to `src-tauri/target/release/bundle/`.

## Full Disk Access

macOS hides some folders from apps by default. Bytesize skips folders it can't read and reports them. To scan your whole startup disk, grant access in **System Settings → Privacy & Security → Full Disk Access**.

## Development

```bash
npm run build                                       # type-check and build the frontend
npm run lint                                        # lint the frontend
cd src-tauri && cargo test                          # run the Rust tests
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

The scanner lives in `src-tauri/src/scanner.rs` and the chart in `src/components/SunburstCanvas.tsx`.

## License

[MIT](LICENSE)
