# Source Code Review - Build Instructions

## Build Environment

- **Node.js**: >= 22.0.0
- **pnpm**: 10.30.2 (auto-installed via corepack)

## Build Steps

```bash
# 1. Enable corepack (ships with Node.js) to auto-install the correct pnpm version
corepack enable

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Build the Firefox extension
pnpm zip:firefox
```

## Environment Variables

The `.env.production` file is included in this archive. It contains:

- `WXT_GOOGLE_CLIENT_ID` — A public Google OAuth Client ID used for Google Sign-In. This is **not** a secret; OAuth Client IDs are designed to be embedded in client-side applications.
- `WXT_GOOGLE_TRANSLATE_HTML_PUBLIC_KEY` — Optional public browser key for Google's `translateHtml` endpoint. It is not committed by default; when omitted, Google Translate falls back to the legacy public endpoint.

## Build Output

After a successful build, the packaged extension will be at:

```
.output/read-frog-<version>-firefox.zip
```
