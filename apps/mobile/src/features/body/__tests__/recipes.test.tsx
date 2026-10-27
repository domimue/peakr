import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import { useRemoteFlagsStore } from '@/config/remote-flags';
import type { StoredRecipe } from '@/data/db/schema';
import * as ids from '@/data/ids';
import * as bodyRepo from '@/data/repositories/body-repository';
import type { FoodEntry, FoodItem } from '@/data/repositories/body-repository';
import { useBillingStore } from '@/features/billing/billing-store';
import { entitlementsOf, subscriptionsOf, type CustomerInfoLike } from '@/features/billing/model';
import { health } from '@/features/health/health';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { useRecipeDraft } from '../food/recipe-draft';
import { recipeFoodColumns, summaryOf } from '../food/recipes';
import { AddFoodScreen } from '../food/screens/add-food-screen';
import { FoodDetailScreen } from '../food/screens/food-detail-screen';
import { FoodFormScreen } from '../food/screens/food-form-screen';
import { RecipeScreen } from '../food/screens/recipe-screen';
import { ScanScreen } from '../food/screens/scan-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/billing-repository');

const body = bodyRepo as unknown as typeof import('@/data/repositories/__mocks__/body-repository');

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
  name: 'Food',
  brand: null,
  barcode: null,
  basis: 'g',
  kcal: 100,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  pieceAmount: null,
  portions: [],
  recipe: null,
  favourite: false,
  lastUsedAt: null,
  createdAt: 'x',
  ...over,
});

const PASTA = { kcal: 350, proteinG: 12, carbsG: 72, fatG: 1.5 };
const SAUCE = { kcal: 30, proteinG: 1.5, carbsG: 5, fatG: 0.2 };

/** Pasta bake: 400 g pasta + 800 g sauce, 4 portions, 1,200 g cooked → 410 kcal / 300 g each. */
const BAKE: StoredRecipe = {
  ingredients: [
    { foodId: 'pasta', name: 'Pasta dry', amount: 400, per100: PASTA, basis: 'g', unit: 'g' },
    { foodId: 'sauce', name: 'Tomato sauce', amount: 800, per100: SAUCE, basis: 'g', unit: 'g' },
  ],
  servings: 4,
  totalWeightG: 1200,
  note: 'Bake 25 min',
  photo: null,
};

function storeRecipe(recipe: StoredRecipe = BAKE, over: Partial<FoodItem> = {}): FoodItem {
  const s = summaryOf(recipe)!;
  const r = item({
    id: 'bake',
    kind: 'recipe',
    name: 'Pasta bake',
    ...recipeFoodColumns(s),
    recipe,
    ...over,
  });
  body.store.foods = [...body.store.foods, r];
  return r;
}

const logged = (over: Partial<FoodEntry>): FoodEntry => ({
  id: 'e1',
  day: '2026-10-25',
  meal: 'dinner',
  name: 'Pasta bake',
  kcal: 410,
  proteinG: 15,
  carbsG: 82,
  fatG: 1.9,
  foodId: 'bake',
  amount: 1,
  unit: 'portion',
  portionLabel: 'portion',
  createdAt: 'x',
  ...over,
});

/** Answers the next Alert with the button of this text. */
function answerAlert(text: string) {
  jest.spyOn(Alert, 'alert').mockImplementationOnce((_t, _m, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === text)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  body.resetStore();
  useRecipeDraft.getState().reset();
  active();
  jest.spyOn(ids, 'todayIso').mockReturnValue(TODAY);
  for (const fn of ['push', 'replace', 'dismissTo', 'back'] as const) {
    jest.spyOn(router, fn).mockImplementation(() => undefined);
  }
  fetchMock.mockReset();
  // Offline: everything here works from the device alone.
  fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

describe('creating a recipe', () => {
  it('totals for the whole dish and per portion update live and are saved', async () => {
    await renderWithQuery(<RecipeScreen meal="dinner" day={TODAY} />);
    await fireEvent.changeText(screen.getByTestId('recipe-name'), 'Pasta bake');
    expect(screen.queryByTestId('recipe-totals')).toBeNull();
    // Coming back from the ingredient picker.
    await act(async () => {
      useRecipeDraft.getState().addIngredient(BAKE.ingredients[0]!);
    });
    expect(screen.getByTestId('recipe-total')).toHaveTextContent(/1400 kcal/);
    await act(async () => {
      useRecipeDraft.getState().addIngredient(BAKE.ingredients[1]!);
    });
    expect(screen.getByTestId('recipe-total')).toHaveTextContent(/1640 kcal/);
    expect(screen.getByTestId('recipe-portion')).toHaveTextContent(/1640 kcal/);
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByLabelText('Portions the dish makes, More portions'));
    expect(screen.getByTestId('recipe-portion')).toHaveTextContent(/^Per portion410 kcal/);
    await fireEvent.changeText(screen.getByTestId('recipe-cooked'), '1200');
    expect(screen.getByTestId('recipe-portion')).toHaveTextContent(/Per portion \(≈ 300 g\)/);
    expect(screen.getByTestId('recipe-total')).toHaveTextContent(/1200 g raw · Cooked: 1200 g/);

    await fireEvent.press(screen.getByTestId('recipe-save'));
    await waitFor(() => expect(body.store.foods).toHaveLength(1));
    expect(body.store.foods[0]).toMatchObject({
      kind: 'recipe',
      name: 'Pasta bake',
      kcal: 137,
      portions: [{ label: 'portion', amount: 300 }],
      recipe: { servings: 4, totalWeightG: 1200 },
    });
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/body/food/[id]',
      params: { id: body.store.foods[0]!.id, meal: 'dinner', day: TODAY },
    });
  });

  it('asks for a name and an ingredient before saving', async () => {
    await renderWithQuery(<RecipeScreen meal="dinner" day={TODAY} />);
    await fireEvent.press(screen.getByTestId('recipe-save'));
    expect(screen.getByText('Give the recipe a name.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('recipe-name'), 'Soup');
    await fireEvent.press(screen.getByTestId('recipe-save'));
    expect(screen.getByText('Add at least one ingredient.')).toBeOnTheScreen();
    expect(body.store.foods).toHaveLength(0);
  });

  it('an ingredient amount can be changed afterwards – pieces keep their size', async () => {
    await renderWithQuery(<RecipeScreen meal="breakfast" day={TODAY} />);
    await act(async () => {
      useRecipeDraft.getState().addIngredient({
        foodId: 'egg',
        name: 'Egg',
        basis: 'g',
        per100: { kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
        amount: 180,
        unit: 'piece',
        count: 3,
        portionLabel: null,
      });
    });
    expect(screen.getByTestId('recipe-ingredients')).toHaveTextContent(/3 pieces · 180 g/);
    await fireEvent.press(screen.getByLabelText('Egg, 3 pieces · 180 g'));
    const key = useRecipeDraft.getState().ingredients[0]!.key;
    await fireEvent.changeText(screen.getByTestId(`ingredient-amount-${key}`), '4');
    expect(useRecipeDraft.getState().ingredients[0]).toMatchObject({ count: 4, amount: 240 });
    expect(screen.getByTestId('recipe-total')).toHaveTextContent(/343 kcal/);
  });

  it('Open Food Facts ingredients carry the attribution', async () => {
    await renderWithQuery(<RecipeScreen meal="dinner" day={TODAY} />);
    expect(screen.queryByTestId('off-attribution')).toBeNull();
    await act(async () => {
      useRecipeDraft.getState().addIngredient({ ...BAKE.ingredients[0]!, source: 'off' });
    });
    expect(screen.getByTestId('off-attribution')).toBeOnTheScreen();
  });
});

describe('adding ingredients the same ways as logging', () => {
  it('the add screen in ingredient mode: no meal, no new recipe, the mode carried on', async () => {
    body.store.foods = [item({ id: 'oats', name: 'Oats', favourite: true })];
    await renderWithQuery(<AddFoodScreen meal="breakfast" day={TODAY} mode="ingredient" />);
    expect(screen.getByText('Add an ingredient to the recipe')).toBeOnTheScreen();
    expect(screen.queryByText('Create recipe')).toBeNull();
    await fireEvent.press(screen.getByText('Favourites'));
    await fireEvent.press(await screen.findByText('Oats'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/body/food/[id]',
      params: { id: 'oats', meal: 'breakfast', day: TODAY, mode: 'ingredient' },
    });
    await fireEvent.press(screen.getByText('Scan barcode'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/body/food/scan',
      params: { meal: 'breakfast', day: TODAY, mode: 'ingredient' },
    });
    await fireEvent.press(screen.getByText('Create food'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/body/food/new',
      params: { meal: 'breakfast', day: TODAY, mode: 'ingredient' },
    });
  });

  it('the scanner is the same component and hands the product to the amount picker', async () => {
    body.store.foods = [item({ id: 'mine', barcode: '7612345678901', name: 'Muesli' })];
    await renderWithQuery(<ScanScreen meal="breakfast" day={TODAY} mode="ingredient" />);
    await fireEvent(screen.getByTestId('food-camera'), 'barcodeScanned', {
      data: '7612345678901',
      type: 'ean13',
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/body/food/[id]',
        params: { id: 'mine', meal: 'breakfast', day: TODAY, mode: 'ingredient' },
      }),
    );
  });

  it('entered by hand: the new food goes on to the amount picker', async () => {
    await renderWithQuery(<FoodFormScreen meal="dinner" day={TODAY} mode="ingredient" />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Grandma’s stock');
    await fireEvent.changeText(screen.getByLabelText('Energy'), '20');
    await fireEvent.press(screen.getByText('Save food'));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/body/food/[id]',
        params: { id: expect.any(String), meal: 'dinner', day: TODAY, mode: 'ingredient' },
      }),
    );
  });

  it('the amount picker adds the ingredient with its unit and goes back to the recipe', async () => {
    body.store.foods = [
      item({ id: 'egg', name: 'Egg', kcal: 143, proteinG: 12.6, pieceAmount: 60 }),
    ];
    useRecipeDraft.getState().start(null);
    await renderWithQuery(
      <FoodDetailScreen id="egg" meal="breakfast" day={TODAY} mode="ingredient" />,
    );
    await fireEvent.press(await screen.findByText('pieces'));
    await fireEvent.changeText(screen.getByLabelText('How many'), '3');
    await fireEvent.press(screen.getByTestId('food-add-ingredient'));
    expect(useRecipeDraft.getState().ingredients).toEqual([
      expect.objectContaining({
        foodId: 'egg',
        name: 'Egg',
        amount: 180,
        unit: 'piece',
        count: 3,
        source: 'custom',
      }),
    ]);
    expect(router.dismissTo).toHaveBeenCalledWith('/body/food/recipe');
    // Nothing went into the diary.
    expect(body.store.food).toHaveLength(0);
  });
});

describe('finding and logging a recipe', () => {
  it('recipes are in the search with their own filter, favourites and recent first', async () => {
    body.store.foods = [item({ id: 'pasta', name: 'Pasta dry', kcal: 350 })];
    storeRecipe(BAKE, { favourite: true });
    await renderWithQuery(<AddFoodScreen meal="dinner" day={TODAY} />);
    await fireEvent.changeText(screen.getByLabelText('Search'), 'pasta');
    const results = await screen.findByTestId('food-search-results');
    expect(results).toHaveTextContent(/^Pasta bakeRecipe410 kcal \/ portionPasta dry350 kcal/);
    await fireEvent.press(screen.getByText('My recipes'));
    expect(await screen.findByText('Pasta bake')).toBeOnTheScreen();
    expect(screen.queryByText('Pasta dry')).toBeNull();
  });

  it('one and a half portions, written to the health store like any entry', async () => {
    jest.spyOn(health, 'writeNutrition').mockResolvedValue(true);
    storeRecipe();
    await renderWithQuery(<FoodDetailScreen id="bake" meal="lunch" day={TODAY} />);
    expect(await screen.findByTestId('recipe-per-portion')).toHaveTextContent(
      /Per portion \(≈ 300 g\)410 kcal/,
    );
    await fireEvent.press(screen.getByText('1½ portions'));
    expect(screen.getByTestId('recipe-preview')).toHaveTextContent(/615 kcal.*450 g/);
    await fireEvent.press(screen.getByText('Dinner'));
    await fireEvent.press(screen.getByTestId('recipe-log'));
    await waitFor(() => expect(body.store.food).toHaveLength(1));
    expect(body.store.food[0]).toMatchObject({
      name: 'Pasta bake',
      meal: 'dinner',
      kcal: 615,
      unit: 'portion',
      amount: 1.5,
      foodId: 'bake',
    });
    expect(health.writeNutrition).toHaveBeenCalledWith(
      expect.objectContaining({ kcal: 615, meal: 'dinner' }),
    );
  });

  it('by weight when the cooked dish was weighed: 380 g', async () => {
    storeRecipe();
    await renderWithQuery(<FoodDetailScreen id="bake" meal="dinner" day={TODAY} />);
    await fireEvent.press(await screen.findByText('Weight'));
    await fireEvent.changeText(screen.getByTestId('recipe-grams'), '380');
    await fireEvent.press(screen.getByTestId('recipe-log'));
    await waitFor(() => expect(body.store.food).toHaveLength(1));
    expect(body.store.food[0]).toMatchObject({ kcal: 519, unit: 'g', amount: 380 });
  });

  it('without a cooked weight: portions only', async () => {
    storeRecipe({ ...BAKE, totalWeightG: null });
    await renderWithQuery(<FoodDetailScreen id="bake" meal="dinner" day={TODAY} />);
    expect(await screen.findByTestId('recipe-per-portion')).toHaveTextContent(/^Per portion410/);
    expect(screen.queryByText('Weight')).toBeNull();
  });

  it('a recipe saved before units, notes and photos opens as usual', async () => {
    storeRecipe({
      ingredients: [{ foodId: 'pasta', name: 'Pasta dry', amount: 200, per100: PASTA }],
      totalWeightG: null,
      servings: null,
    });
    await renderWithQuery(<FoodDetailScreen id="bake" meal="dinner" day={TODAY} />);
    expect(await screen.findByTestId('recipe-per-portion')).toHaveTextContent(/700 kcal/);
    expect(screen.getByTestId('recipe-ingredients')).toHaveTextContent(/Pasta dry200 g/);
  });
});

describe('editing never rewrites logged days unless asked', () => {
  async function editSauce(to: string) {
    await renderWithQuery(<RecipeScreen id="bake" meal="dinner" day={TODAY} />);
    await fireEvent.press(await screen.findByLabelText('Tomato sauce, 800 g'));
    const key = useRecipeDraft.getState().ingredients[1]!.key;
    await fireEvent.changeText(screen.getByTestId(`ingredient-amount-${key}`), to);
  }

  it('default: the logged entry keeps its values, the recipe changes', async () => {
    storeRecipe();
    body.store.food = [logged({})];
    await editSauce('400');
    answerAlert('Keep logged days as they are');
    await fireEvent.press(screen.getByTestId('recipe-save'));
    await waitFor(() => expect(body.store.foods[0]?.recipe?.ingredients[1]?.amount).toBe(400));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Already logged',
      expect.stringContaining('once'),
      expect.any(Array),
    );
    expect(body.store.food[0]).toEqual(logged({}));
    expect(body.updateEntryValues).not.toHaveBeenCalled();
  });

  it('only when chosen: the logged entries are recomputed with the new recipe', async () => {
    storeRecipe();
    body.store.food = [logged({}), logged({ id: 'e2', unit: 'g', amount: 380, kcal: 519 })];
    await editSauce('400');
    answerAlert('Also update the 2 logged entries');
    await fireEvent.press(screen.getByTestId('recipe-save'));
    // 400 g pasta + 400 g sauce = 1,520 kcal in 4 portions; the cooked weight stays 1,200 g.
    await waitFor(() => expect(body.store.food[0]?.kcal).toBe(380));
    expect(body.store.food[1]?.kcal).toBe(Math.round((1520 * 380) / 1200));
  });

  it('scaling ("cooked double"): twice the portions, the same portion – nothing to ask', async () => {
    storeRecipe();
    body.store.food = [logged({})];
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithQuery(<RecipeScreen id="bake" meal="dinner" day={TODAY} scale={2} />);
    expect(await screen.findByTestId('recipe-scaled')).toBeOnTheScreen();
    expect(screen.getByTestId('recipe-portion')).toHaveTextContent(/≈ 300 g\)410 kcal/);
    await fireEvent.press(screen.getByTestId('recipe-save'));
    await waitFor(() => expect(body.store.foods[0]?.recipe?.servings).toBe(8));
    expect(body.store.foods[0]?.recipe).toMatchObject({ totalWeightG: 2400 });
    expect(body.store.foods[0]?.recipe?.ingredients.map((i) => i.amount)).toEqual([800, 1600]);
    expect(alert).not.toHaveBeenCalled();
    expect(body.store.food[0]).toEqual(logged({}));
  });

  it('scale opens the editor from the recipe', async () => {
    storeRecipe();
    await renderWithQuery(<FoodDetailScreen id="bake" meal="dinner" day={TODAY} />);
    await fireEvent.press(await screen.findByText('× 2'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/body/food/recipe',
      params: { id: 'bake', scale: '2', meal: 'dinner', day: TODAY },
    });
  });

  it('save as a new recipe leaves the original and its entries alone', async () => {
    storeRecipe();
    body.store.food = [logged({})];
    await editSauce('400');
    await fireEvent.changeText(screen.getByTestId('recipe-name'), 'Lighter bake');
    await fireEvent.press(screen.getByTestId('recipe-save-new'));
    await waitFor(() => expect(body.store.foods).toHaveLength(2));
    expect(body.store.foods.find((f) => f.id === 'bake')?.recipe?.ingredients[1]?.amount).toBe(800);
    expect(body.store.foods.find((f) => f.id !== 'bake')?.name).toBe('Lighter bake');
    expect(body.store.food[0]).toEqual(logged({}));
  });
});

describe('duplicating and deleting', () => {
  it('duplicate makes a copy and opens it', async () => {
    storeRecipe();
    await renderWithQuery(<FoodDetailScreen id="bake" meal="dinner" day={TODAY} />);
    await fireEvent.press(await screen.findByTestId('recipe-duplicate'));
    await waitFor(() => expect(body.store.foods).toHaveLength(2));
    const copy = body.store.foods.find((f) => f.id !== 'bake')!;
    expect(copy).toMatchObject({ name: 'Pasta bake (copy)', kind: 'recipe' });
    expect(copy.recipe?.ingredients).toEqual(BAKE.ingredients);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/body/food/[id]',
      params: { id: copy.id, meal: 'dinner', day: TODAY },
    });
  });

  it('deleting the recipe keeps the days it was logged on', async () => {
    storeRecipe();
    body.store.food = [logged({})];
    await renderWithQuery(<FoodDetailScreen id="bake" meal="dinner" day={TODAY} />);
    answerAlert('Delete recipe');
    await fireEvent.press(await screen.findByTestId('recipe-delete'));
    await waitFor(() => expect(body.store.foods).toHaveLength(0));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this recipe?',
      'Days you logged it on keep their entries.',
      expect.any(Array),
    );
    expect(body.store.food).toEqual([logged({})]);
  });
});
