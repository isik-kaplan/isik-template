const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins')

// A release build refuses plain http, which the e2e stack and a dev server on the LAN speak. Only the hosts of
// http:// origins this build was given are let through, so a build against https origins changes nothing.

/** The hosts of the given origins that are plain http. */
function plainHttpHosts(origins) {
  return [
    ...new Set(origins.filter((origin) => origin?.startsWith('http://')).map((origin) => new URL(origin).hostname)),
  ]
}

function withPlainHttp(config, options) {
  const hosts = plainHttpHosts(options?.origins ?? [])
  if (hosts.length === 0) return config
  config = withInfoPlist(config, (config) => {
    const security = config.modResults.NSAppTransportSecurity ?? {}
    const domains = { ...security.NSExceptionDomains }
    for (const host of hosts) domains[host] = { NSExceptionAllowsInsecureHTTPLoads: true }
    config.modResults.NSAppTransportSecurity = { ...security, NSExceptionDomains: domains }
    return config
  })
  // Android has no per-host switch short of a network security config file; cleartext is a whole-app setting.
  return withAndroidManifest(config, (config) => {
    for (const application of config.modResults.manifest.application ?? []) {
      application.$['android:usesCleartextTraffic'] = 'true'
    }
    return config
  })
}

module.exports = withPlainHttp
module.exports.plainHttpHosts = plainHttpHosts
