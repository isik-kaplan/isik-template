import withPlainHttp, { plainHttpHosts } from '../../plugins/withPlainHttp'
import type { ExpoConfig } from 'expo/config'

// Runs the mods the plugin registered against hand-made results, as prebuild would.
async function prebuilt(config: ExpoConfig, plist: Record<string, unknown>, manifest: Record<string, unknown>) {
  const mods = (config as { mods?: Record<string, Record<string, (c: unknown) => Promise<unknown>>> }).mods ?? {}
  const results: Record<string, unknown> = {}
  for (const [platform, name, modResults] of [
    ['ios', 'infoPlist', plist],
    ['android', 'manifest', manifest],
  ] as const) {
    const mod = mods[platform]?.[name]
    if (!mod) continue
    const done = (await mod({ ...config, modResults, modRequest: { platform, introspect: true } })) as {
      modResults: unknown
    }
    results[name] = done.modResults
  }
  return results
}

const base: ExpoConfig = { name: 'app', slug: 'app' }

describe('plainHttpHosts', () => {
  it('names each plain-http host once, and none of the https or missing ones', () => {
    expect(
      plainHttpHosts([
        'http://api.example.test',
        'https://auth.example.test',
        undefined,
        'http://api.example.test:8000',
      ])
    ).toEqual(['api.example.test'])
  })
})

describe('withPlainHttp', () => {
  it('leaves a build against https origins alone', () => {
    const config = withPlainHttp(base, { origins: ['https://api.example.test'] })
    expect(config).toBe(base)
    expect(withPlainHttp(base)).toBe(base)
  })

  it('lets plain http through to those hosts only on iOS, and keeps what the plist already says', async () => {
    const config = withPlainHttp({ ...base }, { origins: ['http://api.example.test', 'http://10.0.2.2'] })
    const plist = { NSAppTransportSecurity: { NSAllowsLocalNetworking: true, NSExceptionDomains: { 'x.test': {} } } }
    const { infoPlist } = await prebuilt(config, plist, { manifest: { application: [{ $: {} }] } })
    expect(infoPlist).toEqual({
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: {
          'x.test': {},
          'api.example.test': { NSExceptionAllowsInsecureHTTPLoads: true },
          '10.0.2.2': { NSExceptionAllowsInsecureHTTPLoads: true },
        },
      },
    })
  })

  it('starts the exceptions from nothing when the plist has none', async () => {
    const config = withPlainHttp({ ...base }, { origins: ['http://api.example.test'] })
    const { infoPlist } = await prebuilt(config, {}, { manifest: {} })
    expect(infoPlist).toEqual({
      NSAppTransportSecurity: {
        NSExceptionDomains: { 'api.example.test': { NSExceptionAllowsInsecureHTTPLoads: true } },
      },
    })
  })

  it('allows cleartext on Android, to every application in the manifest', async () => {
    const config = withPlainHttp({ ...base }, { origins: ['http://api.example.test'] })
    const { manifest } = await prebuilt(config, {}, { manifest: { application: [{ $: { 'android:label': 'x' } }] } })
    expect(manifest).toEqual({
      manifest: { application: [{ $: { 'android:label': 'x', 'android:usesCleartextTraffic': 'true' } }] },
    })
    const bare = await prebuilt(withPlainHttp({ ...base }, { origins: ['http://a.test'] }), {}, { manifest: {} })
    expect(bare.manifest).toEqual({ manifest: {} })
  })
})
