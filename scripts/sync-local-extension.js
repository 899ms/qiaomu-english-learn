import { cp, mkdir, readFile, rm, stat } from "node:fs/promises"
import { resolve } from "node:path"
import process from "node:process"

const source = resolve(".output/chrome-mv3")
const target = process.env.LOCAL_EXTENSION_DIR
  ? resolve(process.env.LOCAL_EXTENSION_DIR)
  : resolve(".local/chrome-extension")

async function assertBuiltExtension() {
  const manifestPath = resolve(source, "manifest.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  if (manifest.manifest_version !== 3) {
    throw new Error(`Expected a Chrome MV3 manifest at ${manifestPath}`)
  }

  return manifest
}

async function main() {
  const sourceStat = await stat(source)
  if (!sourceStat.isDirectory()) {
    throw new Error(`Build output is not a directory: ${source}`)
  }

  const manifest = await assertBuiltExtension()
  await mkdir(target, { recursive: true })
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await cp(source, target, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  })

  console.log(`Synced ${manifest.name ?? "Chrome extension"} ${manifest.version ?? ""} to ${target}`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
