import { pathToFileURL } from 'node:url'

export function requireEnvironment(names, env = process.env) {
  const missing = names.filter((name) => !env[name]?.trim())
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  return Object.fromEntries(names.map((name) => [name, env[name]]))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireEnvironment(process.argv.slice(2))
    console.log('Required environment variables are configured.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
