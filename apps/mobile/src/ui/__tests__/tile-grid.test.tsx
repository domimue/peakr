import { render, screen } from '@testing-library/react-native';
import * as RN from 'react-native';
import { StyleSheet } from 'react-native';

import { StatTile, TileGrid } from '../components/stat-tile';

/** The window as `useWindowDimensions` sees it (the RN Jest preset starts at font scale 2). */
const dims = (width: number, fontScale: number) => {
  const window = { width, height: 800, scale: 2, fontScale };
  (RN.Dimensions as unknown as { set: (d: object) => void }).set({ window, screen: window });
};

const basis = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).flexBasis;

async function tiles() {
  await render(
    <TileGrid testID="grid">
      <StatTile
        testID="a"
        label="Trend weight"
        value="80.4 kg"
        context="▼ 0.6 kg · last 7 days"
        tone="favourable"
      />
      <StatTile testID="b" label="Since start" value="-3.6 kg" />
      <StatTile testID="c" label="Body fat" value="20.5 %" />
    </TileGrid>,
  );
}

afterAll(() => dims(750, 2));

describe('TileGrid', () => {
  it('wraps into two columns on a phone', async () => {
    dims(390, 1);
    await tiles();
    expect(StyleSheet.flatten(screen.getByTestId('grid').props.style).flexWrap).toBe('wrap');
    expect(basis('a')).toBe('40%');
    expect(basis('c')).toBe('40%');
  });

  it('one column on narrow screens and with the largest font', async () => {
    dims(320, 1);
    await tiles();
    expect(basis('a')).toBe('100%');
    await screen.unmount();
    dims(390, 2);
    await tiles();
    expect(basis('b')).toBe('100%');
  });

  it('reads label, value and the change in words', async () => {
    dims(390, 1);
    await tiles();
    expect(
      screen.getByLabelText('Trend weight: 80.4 kg, ▼ 0.6 kg · last 7 days'),
    ).toBeOnTheScreen();
    // Nothing is cut off: no line limit on the texts.
    expect(screen.getByText('Trend weight').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('80.4 kg').props.numberOfLines).toBeUndefined();
  });
});
