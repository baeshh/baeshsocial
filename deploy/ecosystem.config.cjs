// PM2 process file. One fork-mode process per server: rate limits and the job scheduler are
// in-process, so do not switch to cluster mode without moving them to shared storage first.
const fs = require('node:fs')
const path = require('node:path')

const envName = process.env.BAESH_ENV || 'staging'
const root = process.env.BAESH_ROOT || `/srv/baesh/${envName}`
const current = path.join(root, 'current')
const rdsCaBundle = process.env.RDS_CA_BUNDLE || '/etc/ssl/certs/rds-global-bundle.pem'
let version = 'unknown'
try {
  version = path.basename(fs.realpathSync(current))
} catch {
  // first deploy: `current` is created right before PM2 starts
}

module.exports = {
  apps: [
    {
      name: `baesh-api-${envName}`,
      cwd: path.join(current, 'backend'),
      script: 'dist/src/server.js',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 20000,
      listen_timeout: 15000,
      max_memory_restart: '1G',
      out_file: path.join(root, 'shared/logs/api.out.log'),
      error_file: path.join(root, 'shared/logs/api.err.log'),
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        APP_ENV: envName,
        APP_VERSION: version,
        // RDS requires TLS and node-postgres verifies the certificate; Node reads this only at startup.
        ...(fs.existsSync(rdsCaBundle) ? { NODE_EXTRA_CA_CERTS: rdsCaBundle } : {}),
      },
    },
  ],
}
