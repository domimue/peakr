import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** A generated file the user hands to another app (watch workout, GPX course, Zwift workout). */
export interface SharedFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  /** iOS uniform type identifier, so the share sheet offers the right apps. */
  uti?: string;
}

export type ShareResult = 'shared' | 'unavailable' | 'failed';

/** Writes the file to the cache and opens the system share sheet ("Save to Files", Garmin Connect …). */
export async function shareFile(file: SharedFile): Promise<ShareResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const target = new File(Paths.cache, file.name);
    target.create({ overwrite: true });
    await target.write(file.bytes);
    await Sharing.shareAsync(target.uri, {
      mimeType: file.mime,
      dialogTitle: file.name,
      ...(file.uti ? { UTI: file.uti } : {}),
    });
    return 'shared';
  } catch (e) {
    console.warn('Sharing the file failed', String(e));
    return 'failed';
  }
}
