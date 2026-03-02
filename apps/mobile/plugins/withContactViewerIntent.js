const {
  withAndroidManifest,
  withMainActivity,
} = require("@expo/config-plugins");

/**
 * Config plugin that registers Orbit as a handler for Android contact VIEW intents.
 *
 * 1. Adds READ_CONTACTS permission and intent-filters to AndroidManifest.xml
 * 2. Injects handleContactViewIntent() into MainActivity to rewrite the incoming
 *    content:// URI to orbit://view-contact so Expo Router can handle it.
 */

function withContactViewerManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // --- Add READ_CONTACTS permission ---
    const permissions = manifest.manifest["uses-permission"] || [];
    if (
      !permissions.some(
        (p) => p.$["android:name"] === "android.permission.READ_CONTACTS"
      )
    ) {
      permissions.push({
        $: { "android:name": "android.permission.READ_CONTACTS" },
      });
    }
    manifest.manifest["uses-permission"] = permissions;

    // --- Add intent-filters for contact VIEW intents on MainActivity ---
    const app = manifest.manifest.application[0];
    const mainActivity = app.activity.find(
      (a) => a.$["android:name"] === ".MainActivity"
    );

    if (mainActivity) {
      const intentFilters = mainActivity["intent-filter"] || [];

      const contactMimeTypes = [
        "vnd.android.cursor.item/contact",
        "vnd.android.cursor.item/person",
        "vnd.android.cursor.item/phone_v2",
      ];

      for (const mimeType of contactMimeTypes) {
        const alreadyExists = intentFilters.some(
          (f) =>
            f.data &&
            f.data.some((d) => d.$["android:mimeType"] === mimeType)
        );
        if (!alreadyExists) {
          intentFilters.push({
            action: [
              { $: { "android:name": "android.intent.action.VIEW" } },
            ],
            category: [
              { $: { "android:name": "android.intent.category.DEFAULT" } },
            ],
            data: [{ $: { "android:mimeType": mimeType } }],
          });
        }
      }

      mainActivity["intent-filter"] = intentFilters;
    }

    return config;
  });
}

function withContactViewerMainActivity(config) {
  return withMainActivity(config, (config) => {
    let src = config.modResults.contents;

    if (src.includes("handleContactViewIntent")) {
      // Already patched
      return config;
    }

    // 1. Add Intent import
    if (!src.includes("import android.content.Intent")) {
      src = src.replace(
        "import android.os.Bundle",
        "import android.content.Intent\nimport android.os.Bundle"
      );
    }

    // 2. Call handleContactViewIntent(intent) in onCreate before super.onCreate
    src = src.replace(
      "super.onCreate(null)",
      "handleContactViewIntent(intent)\n    super.onCreate(null)"
    );

    // 3. Add handleContactViewIntent method + onNewIntent override
    //    Insert before invokeDefaultOnBackPressed
    const newMethods = `
  private fun handleContactViewIntent(intent: Intent) {
    val contactMimeTypes = listOf(
      "vnd.android.cursor.item/contact",
      "vnd.android.cursor.item/person",
      "vnd.android.cursor.item/phone_v2"
    )
    if (intent.action == Intent.ACTION_VIEW &&
        intent.type != null &&
        contactMimeTypes.contains(intent.type)) {
      intent.putExtra("ORBIT_CONTACT_URI", intent.data?.toString() ?: "")
      intent.data = android.net.Uri.parse("orbit://view-contact")
    }
  }

  override fun onNewIntent(intent: Intent) {
    handleContactViewIntent(intent)
    super.onNewIntent(intent)
  }

`;

    src = src.replace(
      "  override fun invokeDefaultOnBackPressed()",
      `${newMethods}  override fun invokeDefaultOnBackPressed()`
    );

    config.modResults.contents = src;
    return config;
  });
}

function withContactViewerIntent(config) {
  config = withContactViewerManifest(config);
  config = withContactViewerMainActivity(config);
  return config;
}

module.exports = withContactViewerIntent;
