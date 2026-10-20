// eslint-disable-next-line @typescript-eslint/no-require-imports
const { patchMainActivity } = require('../with-share-gpx');

const ACTIVITY = `class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}
`;

describe('with-share-gpx', () => {
  it('maps shared files to the import before React Native reads the intent, once', () => {
    const out: string = patchMainActivity(ACTIVITY);
    expect(out).toContain('shareToView(intent)\n    super.onCreate(null)');
    expect(out).toContain('override fun onNewIntent');
    expect(out).toContain('peakr://routes/import?text=');
    expect(patchMainActivity(out)).toBe(out);
    expect(patchMainActivity('class Other')).toBe('class Other');
  });
});
