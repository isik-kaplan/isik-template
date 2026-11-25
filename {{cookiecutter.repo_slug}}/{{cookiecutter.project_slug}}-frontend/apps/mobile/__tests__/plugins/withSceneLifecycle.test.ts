import withSceneLifecycle, { SCENE_MANIFEST, adoptScenes } from '../../plugins/withSceneLifecycle'

// The app delegate as Expo 57's prebuild writes it, cut to the parts the plugin touches.
const TEMPLATE = `@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`

describe('withSceneLifecycle', () => {
  it('leaves the window to the scene delegate and gives it the factory to start React Native from', () => {
    const adopted = adoptScenes(TEMPLATE)
    expect(adopted).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    expect(adopted).not.toContain('UIWindow(frame:')
    expect(adopted).not.toContain('startReactNative')
    expect(adopted).toContain('return super.application(application, didFinishLaunchingWithOptions: launchOptions)')
  })

  it('changes nothing more when prebuilt twice', () => {
    expect(adoptScenes(adoptScenes(TEMPLATE))).toBe(adoptScenes(TEMPLATE))
  })

  it('stops the build rather than guess at an app delegate of another shape', () => {
    expect(() => adoptScenes('class Something {}')).toThrow(/adopt scenes by hand/)
    expect(() => adoptScenes(TEMPLATE.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate {'))).toThrow()
  })

  it("names Expo's scene delegate for the app's one window scene", () => {
    expect(SCENE_MANIFEST).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' },
        ],
      },
    })
  })

  it('is a config plugin over Info.plist and the app delegate', () => {
    const config = withSceneLifecycle({ name: 'app', slug: 'app' }) as {
      mods?: { ios?: { infoPlist?: unknown; appDelegate?: unknown } }
    }
    expect(config.mods?.ios?.infoPlist).toBeInstanceOf(Function)
    expect(config.mods?.ios?.appDelegate).toBeInstanceOf(Function)
  })
})
