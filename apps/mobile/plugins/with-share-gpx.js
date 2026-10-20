// Android share sheet → route import (CLAUDE.md "Route sources"; Komoot without a partner API).
// A GPX file shared into Peakr arrives as ACTION_SEND with the file in EXTRA_STREAM, which React
// Native's Linking never sees. This plugin registers Peakr as a share target for GPX files and,
// in MainActivity, turns such an intent into a VIEW intent with the file as its data – from there
// it takes the same path as "Open with Peakr" (app/+native-intent.tsx → /routes/import).
// A shared Komoot *link* (text) is passed on as peakr://routes/import?text=… so the import screen
// can explain how to export the tour as GPX (nothing is fetched from komoot.com).
const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const MARKER = '// @generated peakr-share-gpx';
const MIME_TYPES = [
  'application/gpx+xml',
  'application/gpx',
  'application/octet-stream',
  'application/xml',
  'text/xml',
  'text/plain',
];

function withShareFilter(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = activity['intent-filter'] ?? [];
    const exists = filters.some((f) =>
      (f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND'),
    );
    if (!exists) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: MIME_TYPES.map((mime) => ({ $: { 'android:mimeType': mime } })),
      });
      activity['intent-filter'] = filters;
    }
    return cfg;
  });
}

const HELPER = `
  ${MARKER}
  /** ACTION_SEND (share sheet) → ACTION_VIEW with the shared GPX file or link as data. */
  private fun shareToView(intent: android.content.Intent?) {
    if (intent?.action != android.content.Intent.ACTION_SEND) return
    val stream: android.net.Uri? =
      if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(android.content.Intent.EXTRA_STREAM, android.net.Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(android.content.Intent.EXTRA_STREAM)
      }
    val text = intent.getStringExtra(android.content.Intent.EXTRA_TEXT)
    val data = stream
      ?: text?.let { android.net.Uri.parse("peakr://routes/import?text=" + android.net.Uri.encode(it)) }
      ?: return
    intent.action = android.content.Intent.ACTION_VIEW
    intent.data = data
  }

  override fun onNewIntent(intent: android.content.Intent) {
    shareToView(intent)
    super.onNewIntent(intent)
    setIntent(intent)
  }
`;

/** Adds the helper to MainActivity.kt and calls it before React Native reads the intent. */
function patchMainActivity(src) {
  if (src.includes(MARKER) || !src.includes('super.onCreate(')) return src;
  const patched = src.replace('super.onCreate(', 'shareToView(intent)\n    super.onCreate(');
  const last = patched.lastIndexOf('}');
  return `${patched.slice(0, last)}${HELPER}}\n`;
}

function withShareActivity(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language === 'kt') {
      cfg.modResults.contents = patchMainActivity(cfg.modResults.contents);
    }
    return cfg;
  });
}

module.exports = function withShareGpx(config) {
  return withShareActivity(withShareFilter(config));
};
module.exports.patchMainActivity = patchMainActivity;
