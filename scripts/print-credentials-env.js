require('dotenv').config()

const fs = require('fs')
const path = require('path')

const BACKEND_ROOT = path.resolve(__dirname, '..')
const OUTPUT_FILE = path.join(BACKEND_ROOT, '.google-credentials-string.txt')

function resolveCredentialsFile() {
  const argPath = process.argv[2]
  if (argPath) {
    return path.isAbsolute(argPath) ? argPath : path.resolve(process.cwd(), argPath)
  }

  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(BACKEND_ROOT, configured)
  }

  const jsonFiles = fs
    .readdirSync(BACKEND_ROOT)
    .filter((file) => file.endsWith('.json') && file !== 'package.json' && file !== 'package-lock.json')

  for (const file of jsonFiles) {
    const fullPath = path.join(BACKEND_ROOT, file)
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
      if (parsed.type === 'service_account') {
        return fullPath
      }
    } catch {
      // ignore invalid JSON files
    }
  }

  return null
}

function main() {
  const credentialsFile = resolveCredentialsFile()
  if (!credentialsFile || !fs.existsSync(credentialsFile)) {
    console.error('Service account JSON not found.')
    console.error('Usage: npm run credentials:env [path/to/service-account.json]')
    process.exit(1)
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))
  const oneLine = JSON.stringify(credentials)
  const envLine = `GOOGLE_APPLICATION_CREDENTIALS_JSON=${oneLine}`

  fs.writeFileSync(OUTPUT_FILE, `${envLine}\n`, 'utf8')

  console.log(`Source file: ${credentialsFile}`)
  console.log(`Project ID: ${credentials.project_id || '(missing)'}`)
  console.log(`Wrote Vercel-ready env value to: ${OUTPUT_FILE}`)
  console.log('Copy the GOOGLE_APPLICATION_CREDENTIALS_JSON value into Vercel (do not commit this file).')
}

main()
