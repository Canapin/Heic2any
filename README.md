# Heic2any

Converts HEIC/HEIF attachments to JPEG when they are added to Discord uploads.

## Install

From the Vencord repository root, install the runtime dependency and build:

```sh
pnpm add heic2any@^0.0.4
pnpm build --dev
```

The plugin loads the converter only when a HEIC/HEIF file is uploaded. This is intentional: the
`heic2any` package creates a Web Worker when evaluated, and should not be initialized during
Vencord startup.
