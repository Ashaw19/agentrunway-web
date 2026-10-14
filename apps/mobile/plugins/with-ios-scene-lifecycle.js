// iOS 27 refuses to launch an app built with its SDK unless the app uses the
// UIScene lifecycle (crash in _UIApplicationEvaluateRuntimeIssueForNoScene-
// LifecycleAdoption at launch). Expo SDK 54's AppDelegate template creates its
// window in didFinishLaunching, so this plugin moves that work into a
// SceneDelegate and declares the scene in Info.plist. Xcode 27 also rejects
// pods that target below iOS 15, so their deployment target is raised.
//
// Each patch throws when the template no longer matches, so an Expo upgrade
// that changes the AppDelegate fails `expo prebuild` loudly instead of
// shipping an app that crashes on open.
const { withAppDelegate, withInfoPlist, withPodfile } = require("expo/config-plugins");

const SCENE_DELEGATE_CLASS = "$(PRODUCT_MODULE_NAME).SceneDelegate";
const MIN_POD_IOS = "15.1";

const WINDOW_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

const FACTORY_PROPERTY = "  var reactNativeFactory: RCTReactNativeFactory?\n";

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    if let url = connectionOptions.urlContexts.first?.url {
      _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
    }
    if let activity = connectionOptions.userActivities.first {
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let url = URLContexts.first?.url else { return }
    _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function patchAppDelegate(contents) {
  if (contents.includes("class SceneDelegate")) return contents;
  if (!contents.includes(WINDOW_BLOCK) || !contents.includes(FACTORY_PROPERTY)) {
    throw new Error(
      "with-ios-scene-lifecycle: AppDelegate.swift no longer matches the Expo SDK 54 template. " +
        "Update the plugin for the new template, or drop it if Expo now adopts the scene lifecycle.",
    );
  }
  return (
    contents
      .replace(
        FACTORY_PROPERTY,
        `${FACTORY_PROPERTY}  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`,
      )
      .replace(
        WINDOW_BLOCK,
        "    // SceneDelegate creates the window and starts React Native.\n" +
          "    self.launchOptions = launchOptions\n",
      ) + SCENE_DELEGATE
  );
}

function addSceneManifest(infoPlist) {
  return {
    ...infoPlist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default",
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    },
  };
}

const POST_INSTALL_ANCHOR = "      :ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n";

function raisePodDeploymentTarget(podfile) {
  if (podfile.includes("with-ios-scene-lifecycle")) return podfile;
  if (!podfile.includes(POST_INSTALL_ANCHOR)) {
    throw new Error("with-ios-scene-lifecycle: Podfile post_install no longer matches the Expo SDK 54 template.");
  }
  return podfile.replace(
    POST_INSTALL_ANCHOR,
    `${POST_INSTALL_ANCHOR}    # with-ios-scene-lifecycle: Xcode 27 only builds iOS ${MIN_POD_IOS}+ pod targets.
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_POD_IOS}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_POD_IOS}'
        end
      end
    end
`,
  );
}

function withIosSceneLifecycle(config) {
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") {
      throw new Error("with-ios-scene-lifecycle: expected a Swift AppDelegate.");
    }
    c.modResults.contents = patchAppDelegate(c.modResults.contents);
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults = addSceneManifest(c.modResults);
    return c;
  });
  config = withPodfile(config, (c) => {
    c.modResults.contents = raisePodDeploymentTarget(c.modResults.contents);
    return c;
  });
  return config;
}

module.exports = withIosSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.addSceneManifest = addSceneManifest;
module.exports.raisePodDeploymentTarget = raisePodDeploymentTarget;
