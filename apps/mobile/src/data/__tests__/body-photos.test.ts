import { extOf, remotePath } from '../body-photos';

describe('progress photo paths', () => {
  it("keeps every photo in the user's own folder of the private bucket", () => {
    expect(remotePath('u1', 'm1', 'front', 'file:///docs/m1-front.jpeg')).toBe('u1/m1/front.jpg');
    expect(remotePath('u1', 'm1', 'side', 'file:///cache/IMG_1.HEIC')).toBe('u1/m1/side.heic');
  });

  it('reads the image type from the file name, JPEG when unknown', () => {
    expect(extOf('content://media/photo.png?x=1')).toBe('png');
    expect(extOf('file:///a/b.webp')).toBe('webp');
    expect(extOf('content://media/external/images/42')).toBe('jpg');
  });
});
