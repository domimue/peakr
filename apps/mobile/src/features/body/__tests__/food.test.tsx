import { generatePlan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import type { StoredPlanInput } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as activityRepo from '@/data/repositories/activity-repository';
import * as bodyRepo from '@/data/repositories/body-repository';
import type { FoodItem } from '@/data/repositories/body-repository';
import * as planRepo from '@/data/repositories/plan-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { health } from '@/features/health/health';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { lookupBarcode } from '../food/off-client';
import { AddFoodScreen } from '../food/screens/add-food-screen';
import { FoodDetailScreen } from '../food/screens/food-detail-screen';
import { ScanScreen } from '../food/screens/scan-screen';
import { NutritionScreen } from '../screens/nutrition-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/billing-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');
const plan = planRepo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');
const activities =
  activityRepo as unknown as typeof import('@/data/repositories/__mocks__/activity-repository');

const TODAY = '2026-10-26';
const fetchMock = jest.fn();

function active() {
  const e = {
    productIdentifier: 'peakr_body',
    store: 'PLAY_STORE',
    periodType: 'NORMAL',
    willRenew: true,
    expirationDate: '2026-12-01T00:00:00Z',
  };
  const info: CustomerInfoLike = {
    entitlements: { active: { body_nutrition: e }, all: { body_nutrition: e } },
    managementURL: null,
  };
  useRemoteFlagsStore.setState({ flags: { addon_body_nutrition: true }, loaded: true });
  useBillingStore.setState({
    status: 'ready',
    entitlements: entitlementsOf(info),
    subscriptions: subscriptionsOf(info),
    devBody: false,
    cachedAddon: null,
  });
}

const item = (over: Partial<FoodItem>): FoodItem => ({
  id: 'f1',
  kind: 'custom',
  name: 'Oat bar',
  brand: null,
  barcode: null,
  basis: 'g',
  kcal: 400,
  proteinG: 10,
  carbsG: 60,
  fatG: 12,
  pieceAmount: null,
  portions: [],
  recipe: null,
  favourite: false,
  lastUsedAt: null,
  createdAt: 'x',
  ...over,
});

const OFF_PRODUCT = {
  status: 1,
  product: {
    product_name: 'Crunchy Muesli',
    brands: 'Alpine',
    serving_size: '45 g',
    nutriments: { 'energy-kcal_100g': 412, proteins_100g: 9, carbohydrates_100g: 63, fat_100g: 12 },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  body.resetStore();
  plan.resetStore();
  activities.resetStore();
  active();
  body.store.profile = { sex: 'female', birthDate: '1991-03-14', heightCm: 168, weightKg: 61 };
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  for (const fn of ['push', 'replace', 'dismissTo', 'back'] as const) {
    jest.spyOn(router, fn).mockImplementation(() => undefined);
  }
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

const okJson = (json: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(json) });

describe('barcode lookup', () => {
  it('finds a product on Open Food Facts and keeps it in the local cache', async () => {
    fetchMock.mockImplementation(() => okJson(OFF_PRODUCT));
    const r = await lookupBarcode('7612345678901');
    expect(r).toMatchObject({
      status: 'found',
      fromCache: false,
      food: { kind: 'off', name: 'Crunchy Muesli', kcal: 412 },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v2/product/7612345678901.json');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'User-Agent': expect.stringContaining('Peakr'),
    });
    // Offline the second time: the cache answers.
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(await lookupBarcode('7612345678901')).toMatchObject({
      status: 'found',
      fromCache: true,
    });
  });

  it('a corrected (own) entry wins over the cache, without asking OFF', async () => {
    body.store.foods = [
      item({ id: 'off1', kind: 'off', barcode: '7612345678901', kcal: 412 }),
      item({ id: 'mine', kind: 'custom', barcode: '7612345678901', kcal: 380 }),
    ];
    expect(await lookupBarcode('7612345678901')).toMatchObject({
      status: 'found',
      food: { id: 'mine' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unknown or offline: says so', async () => {
    fetchMock.mockImplementation(() => okJson({ status: 0 }));
    expect(await lookupBarcode('4000000000000')).toEqual({ status: 'notFound' });
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(await lookupBarcode('4000000000000')).toEqual({ status: 'offline' });
  });

  it('the scanner opens the portion picker for a known product, and offers to create an unknown one', async () => {
    fetchMock.mockImplementation(() => okJson(OFF_PRODUCT));
    const { unmount } = await renderWithQuery(<ScanScreen meal="breakfast" day={TODAY} />);
    await fireEvent(screen.getByTestId('food-camera'), 'barcodeScanned', {
      data: '7612345678901',
      type: 'ean13',
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/body/food/[id]',
        params: { id: expect.any(String), meal: 'breakfast', day: TODAY },
      }),
    );
    expect(screen.getByTestId('off-attribution')).toBeOnTheScreen();
    await unmount();

    fetchMock.mockImplementation(() => okJson({ status: 0 }));
    await renderWithQuery(<ScanScreen meal="breakfast" day={TODAY} />);
    await fireEvent(screen.getByTestId('food-camera'), 'barcodeScanned', {
      data: '4000000000000',
      type: 'ean13',
    });
    expect(await screen.findByTestId('scan-notFound')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Create this food'));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/body/food/new',
      params: { barcode: '4000000000000', meal: 'breakfast', day: TODAY },
    });
  });
});

describe('portion picker', () => {
  it('logs a product portion with its macros and writes it to Health Connect where allowed', async () => {
    jest.spyOn(health, 'writeNutrition').mockResolvedValue(true);
    body.store.foods = [item({ portions: [{ label: '1 bar (45 g)', amount: 45 }] })];
    await renderWithQuery(<FoodDetailScreen id="f1" meal="snack" day={TODAY} />);
    // 45 g of 400 kcal / 100 g
    expect(await screen.findByTestId('food-preview')).toHaveTextContent(/180 kcal/);
    await fireEvent.changeText(screen.getByLabelText('How many'), '2');
    expect(screen.getByTestId('food-preview')).toHaveTextContent(/360 kcal/);
    await fireEvent.press(screen.getByText('Add to diary'));
    await waitFor(() => expect(body.store.food).toHaveLength(1));
    expect(body.store.food[0]).toMatchObject({
      meal: 'snack',
      kcal: 360,
      proteinG: 9,
      carbsG: 54,
      fatG: 10.8,
      foodId: 'f1',
      amount: 2,
      unit: 'portion',
      portionLabel: '1 bar (45 g)',
    });
    expect(health.writeNutrition).toHaveBeenCalledWith(
      expect.objectContaining({ kcal: 360, meal: 'snack' }),
    );
    expect(router.dismissTo).toHaveBeenCalledWith('/body');
  });

  it('grams by default; favourites', async () => {
    body.store.foods = [item({})];
    await renderWithQuery(<FoodDetailScreen id="f1" meal="lunch" day={TODAY} />);
    await fireEvent.changeText(await screen.findByLabelText('Amount (g)'), '150');
    expect(screen.getByTestId('food-preview')).toHaveTextContent(/600 kcal/);
    await fireEvent.press(screen.getByTestId('food-favourite'));
    await waitFor(() => expect(body.store.foods[0]?.favourite).toBe(true));
  });
});

describe('adding food', () => {
  it('searches own foods and Open Food Facts, with the attribution', async () => {
    body.store.foods = [item({ name: 'Muesli homemade' })];
    fetchMock.mockImplementation(() =>
      okJson({ products: [{ code: '7612345678901', ...OFF_PRODUCT.product }] }),
    );
    await renderWithQuery(<AddFoodScreen meal="breakfast" day={TODAY} />);
    await fireEvent.changeText(screen.getByLabelText('Search'), 'muesli');
    expect(await screen.findByText('Crunchy Muesli')).toBeOnTheScreen();
    expect(screen.getByText('Muesli homemade')).toBeOnTheScreen();
    expect(screen.getByTestId('off-attribution')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('off-7612345678901'));
    await waitFor(() => expect(body.store.foods.some((f) => f.kind === 'off')).toBe(true));
  });

  it('offline: own foods only, with a note', async () => {
    body.store.foods = [item({ name: 'Muesli homemade' })];
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    await renderWithQuery(<AddFoodScreen meal="breakfast" day={TODAY} />);
    await fireEvent.changeText(screen.getByLabelText('Search'), 'muesli');
    expect(await screen.findByTestId('food-offline')).toBeOnTheScreen();
    expect(screen.getByText('Muesli homemade')).toBeOnTheScreen();
  });

  it('recent foods and favourites', async () => {
    body.store.foods = [
      item({ id: 'a', name: 'Banana', lastUsedAt: '2026-10-25T08:00:00Z' }),
      item({ id: 'b', name: 'Skyr', favourite: true }),
    ];
    await renderWithQuery(<AddFoodScreen meal="breakfast" day={TODAY} />);
    expect(await screen.findByText('Banana')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Favourites'));
    expect(await screen.findByText('Skyr')).toBeOnTheScreen();
  });
});

describe('diary', () => {
  const input: StoredPlanInput = {
    profile: {
      age: 35,
      experience: 'intermediate',
      sports: ['bike'],
      terrain: 'flat',
      strength: { mode: 'none' },
    },
    goal: { kind: 'fitness' },
    availability: { minutesPerDay: [60, 60, 60, 60, 60, 180, 60], doublesAllowed: false },
    hrZones: { age: 35, restingHr: 55 },
  };

  it('copies yesterday’s breakfast into today', async () => {
    body.store.food = [
      {
        id: 'y1',
        day: '2026-10-25',
        meal: 'breakfast',
        name: 'Porridge',
        kcal: 350,
        proteinG: 12,
        carbsG: 55,
        fatG: 8,
        foodId: null,
        amount: null,
        unit: null,
        portionLabel: null,
        createdAt: 'x',
      },
      {
        id: 'y2',
        day: '2026-10-25',
        meal: 'dinner',
        name: 'Curry',
        kcal: 700,
        proteinG: null,
        carbsG: null,
        fatG: null,
        foodId: null,
        amount: null,
        unit: null,
        portionLabel: null,
        createdAt: 'x',
      },
    ];
    await renderWithQuery(<NutritionScreen />);
    const breakfast = await screen.findByTestId('meal-breakfast');
    expect(breakfast).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Copy from yesterday')[0] as never);
    await waitFor(() => expect(body.store.food.filter((f) => f.day === TODAY)).toHaveLength(1));
    expect(await screen.findByText('Copied 1 entry.')).toBeOnTheScreen();
    expect(screen.getByTestId('ring-protein')).toBeOnTheScreen();
  });

  it('shows what today’s ride adds back and a fuelling hint for a long planned session', async () => {
    activities.store.activities = [
      {
        source: 'strava',
        externalId: 'r1',
        sport: 'bike',
        startTime: `${TODAY}T07:00:00Z`,
        date: TODAY,
        durationSec: 5400,
        distanceM: 40000,
        elevationGainM: 300,
        avgHr: 140,
        maxHr: 170,
        swimPaceSecPer100m: null,
        polyline: null,
        name: 'Ride',
        indoor: false,
        commute: false,
        importedAt: 0,
        handled: true,
      } as never,
    ];
    const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', undefined);
    if (!r.ok) throw new Error('plan');
    const long = r.value.weeks.flatMap((w) => w.workouts).find((w) => w.durationMin >= 120);
    if (!long) throw new Error('no long session in the plan');
    long.date = TODAY;
    plan.store.plan = {
      id: 'p',
      input,
      state: { plan: r.value, status: {}, pauses: [], revision: 0 },
    };
    await renderWithQuery(<NutritionScreen />);
    expect(await screen.findByTestId('body-added-back')).toHaveTextContent(
      /Includes \d+ kcal a day for this week’s training/,
    );
    expect(screen.getByTestId('body-fuelling')).toHaveTextContent(/Long session today/);
  });
});
