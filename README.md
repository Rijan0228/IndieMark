# IndieMark

IndieMark is a local-first media distribution record and experimental watermarking workspace designed for GitHub Pages.

## Run the project

1. Open the repository's **Settings → Pages**.
2. Publish the root of the `main` branch.
3. Open the published HTTPS site in a modern browser.

No server, API key, Cloudflare Worker, or account connection is required. Media processing and IndexedDB records stay in the current browser profile.

## Features

- Command Center dashboard and local IndexedDB records.
- Watermark Studio with recipient creation in the same workflow.
- SHA-256 fingerprints using the browser's Web Crypto API.
- Experimental PNG watermark embedding and extraction.
- Experimental 16-bit PCM WAV watermark embedding and extraction.
- Leak Detector for supported watermark recovery and exact hash matching.
- Resilience Lab with actual PNG transformation/recovery attempts.
- Recipients, Evidence Vault with locally saved watermarked PNG/WAV downloads, metadata-only JSON backup, and report summaries.
- Lightweight image/audio/video inspection workers.
- Starter privacy, terms, copyright and security information pages.

## Video support — important limitation

`engines/video-engine.js` currently works with individual Canvas `ImageData` frames. It can embed or extract a prototype payload from frames supplied by another component. It does **not** decode or re-encode MP4/WebM files, preserve audio tracks, or export a watermarked video. The Studio therefore creates metadata-only records for video files.

## Watermark limitations

The image and audio engines use experimental least-significant-bit (LSB) techniques. Resizing, cropping, screenshots, lossy compression, transcoding, resampling, filtering, or other edits can destroy a watermark. A successful checksum only indicates that the recovered payload is internally consistent; it is not a cryptographic signature and does not prove authorship, ownership, or who distributed a file.

## Data and security

Distribution records, recipients, investigations, and generated watermarked copies are stored in IndexedDB in the browser profile. Original source files are not retained. JSON backups contain metadata and hashes, not the generated media blobs. Clearing browser storage can remove local data, so export backups when needed. The application does not upload selected media to an IndieMark server. This prototype has not undergone an independent security, privacy, or legal audit. Do not store sensitive personal information in it.

## Project structure

```
IndieMark/
├── index.html
├── styles.css
├── app.js
├── assets/
│   ├── logo.svg
│   └── icons/indie-mark.svg
├── engines/
│   ├── image-engine.js
│   ├── audio-engine.js
│   ├── video-engine.js
│   └── watermark-core.js
├── workers/
│   ├── image-worker.js
│   ├── audio-worker.js
│   └── video-worker.js
├── modules/
│   ├── database.js
│   ├── fingerprint.js
│   ├── distribution.js
│   ├── recipients.js
│   ├── leak-detector.js
│   ├── resilience-lab.js
│   ├── evidence-vault.js
│   ├── backup.js
│   ├── report-generator.js
│   └── worker-bridge.js
└── legal/
    ├── privacy-policy.html
    ├── terms.html
    ├── copyright.html
    └── security.html
```
