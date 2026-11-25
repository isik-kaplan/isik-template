const { withAppDelegate, withInfoPlist } = require('expo/config-plugins')

// iOS 27 stops any app that hasn't adopted the scene life cycle, at launch. Expo ships the scene delegate
// (EXExpoAppSceneDelegate), but the app delegate prebuild writes still makes its own window. This hands the window to
// the scene delegate: it creates it per scene and starts React Native into it from the app delegate's factory.

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' },
    ],
  },
}

// The window and the start of React Native the template writes, which the scene delegate now does.
const OWN_WINDOW =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/

/** The app delegate's Swift with the window left to the scene delegate; unchanged when already done. */
function adoptScenes(swift) {
  let adopted = swift.replace(OWN_WINDOW, '\n')
  if (!adopted.includes('ExpoReactNativeFactoryProvider')) {
    adopted = adopted.replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
    )
  }
  if (!adopted.includes('ExpoReactNativeFactoryProvider') || OWN_WINDOW.test(adopted)) {
    throw new Error('withSceneLifecycle: the app delegate is not the shape this plugin knows; adopt scenes by hand.')
  }
  return adopted
}

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = SCENE_MANIFEST
    return config
  })
  return withAppDelegate(config, (config) => {
    config.modResults.contents = adoptScenes(config.modResults.contents)
    return config
  })
}

module.exports = withSceneLifecycle
module.exports.adoptScenes = adoptScenes
module.exports.SCENE_MANIFEST = SCENE_MANIFEST
