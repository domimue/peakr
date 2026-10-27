import type { RecipeSummary } from '@peakr/engine';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import type { FoodItem } from '@/data/repositories/body-repository';
import type { Meal } from '@/features/body/meals';
import {
  Button,
  Card,
  ListState,
  numeric,
  radius,
  Screen,
  spacing,
  Stepper,
  Text,
  TextField,
  useTheme,
} from '@/ui';

import { ProgressPhoto } from '../../components/progress-photo';
import { flowParams } from '../flow';
import { useFoodItem, useLoggedCount, useSaveRecipe, type RecipeSave } from '../queries';
import { useRecipeDraft, type DraftIngredient } from '../recipe-draft';
import { summaryOf } from '../recipes';
import { OffAttribution } from './food-row';
import { ingredientText, nutrientsText } from './recipe-text';

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

const MAX_PORTIONS = 50;

/** Did an edit change what a logged portion or gram holds? Only then is there anything to ask. */
function changesLogged(before: RecipeSummary | null, after: RecipeSummary): boolean {
  if (!before) return false;
  const same = (a: RecipeSummary) => JSON.stringify([a.perPortion, a.portionG, a.per100 ?? null]);
  return same(before) !== same(after);
}

/**
 * Creating and editing a recipe: name, photo, note, the ingredients (added through the same
 * search, scanner, favourites and manual entry as logging), how many portions the pot makes and,
 * optionally, what the cooked dish weighs. Totals for the whole dish and per portion update as
 * ingredients come in. Editing never rewrites logged days unless the user says so.
 */
export function RecipeScreen({
  id,
  meal,
  day,
  scale,
}: {
  id?: string;
  meal: Meal;
  day: string;
  /** From "Scale" on the recipe: the editor opens with everything multiplied. */
  scale?: number;
}) {
  const { t } = useTranslation();
  const food = useFoodItem(id);
  if (id && food.isPending) return <ListState kind="loading" label={t('common.loading')} />;
  return <Editor base={food.data ?? null} meal={meal} day={day} scale={scale} />;
}

function Editor({
  base,
  meal,
  day,
  scale,
}: {
  base: FoodItem | null;
  meal: Meal;
  day: string;
  scale?: number;
}) {
  // The draft is set up fresh whenever the editor opens – before anything reads it – and lives
  // while it is open (adding an ingredient leaves the editor and comes back).
  const [cooked, setCooked] = useState(() => {
    const store = useRecipeDraft.getState();
    store.start(base, scale);
    const w = useRecipeDraft.getState().cookedWeightG;
    return w ? String(w) : '';
  });
  const { t } = useTranslation();
  const { colors } = useTheme();
  const draft = useRecipeDraft();
  const save = useSaveRecipe();
  const logged = useLoggedCount(base?.id ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cookedWeightG = parse(cooked);
  const summary = summaryOf({
    ingredients: draft.ingredients,
    servings: draft.portions,
    totalWeightG: cookedWeightG,
  });
  const fromOff = draft.ingredients.some((i) => i.source === 'off');

  const pick = async (from: 'camera' | 'library') => {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('bodyAddon.recipes.photoPermission'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) draft.set({ photo: { kind: 'picked', uri } });
  };

  const submit = (asNew: boolean) => {
    setError(null);
    if (!draft.name.trim()) return setError(t('bodyAddon.recipes.nameMissing'));
    if (!summary) return setError(t('bodyAddon.recipes.ingredientsMissing'));
    const input: RecipeSave = {
      id: asNew ? null : draft.id,
      name: draft.name,
      note: draft.note,
      // A copy starts without the photo unless one was just picked.
      photo: asNew && draft.photo.kind !== 'picked' ? { kind: 'saved', photo: null } : draft.photo,
      ingredients: draft.ingredients,
      portions: draft.portions,
      cookedWeightG,
    };
    const done = (updateLogged: boolean) =>
      save.mutate(
        { ...input, updateLogged },
        {
          onSuccess: ({ item, updated }) => {
            if (updated > 0) Alert.alert(t('bodyAddon.recipes.updatedLogged', { count: updated }));
            router.replace({ pathname: '/body/food/[id]', params: { id: item.id, meal, day } });
          },
        },
      );
    const count = logged.data ?? 0;
    // Logged days are left alone by default; asked only when an edit changes their values.
    if (!asNew && count > 0 && changesLogged(summaryOf(base?.recipe), summary)) {
      Alert.alert(
        t('bodyAddon.recipes.loggedTitle'),
        t('bodyAddon.recipes.loggedBody', { count }),
        [
          { text: t('bodyAddon.recipes.keepLogged'), onPress: () => done(false), style: 'cancel' },
          { text: t('bodyAddon.recipes.updateLogged', { count }), onPress: () => done(true) },
        ],
      );
      return;
    }
    done(false);
  };

  const photo = draft.photo;
  return (
    <Screen>
      {scale && scale !== 1 ? (
        <Text tone="secondary" testID="recipe-scaled">
          {t('bodyAddon.recipes.scaledHint', { factor: scale })}
        </Text>
      ) : null}
      <TextField
        label={t('bodyAddon.recipes.name')}
        value={draft.name}
        onChangeText={(name) => draft.set({ name })}
        testID="recipe-name"
      />

      <View style={styles.stack}>
        <Text variant="label">{t('bodyAddon.recipes.photo')}</Text>
        {photo.kind === 'picked' ? (
          <Image
            source={{ uri: photo.uri }}
            style={[styles.photo, { borderColor: colors.border }]}
            accessibilityIgnoresInvertColors
            testID="recipe-photo-picked"
          />
        ) : photo.kind === 'saved' && photo.photo && !photo.photo.removed ? (
          <ProgressPhoto photo={photo.photo} size={120} />
        ) : null}
        <View style={styles.wrap}>
          <Button
            small
            variant="secondary"
            label={t('bodyAddon.recipes.takePhoto')}
            onPress={() => void pick('camera')}
          />
          <Button
            small
            variant="secondary"
            label={t('bodyAddon.recipes.choosePhoto')}
            onPress={() => void pick('library')}
          />
          {photo.kind === 'picked' || (photo.kind === 'saved' && photo.photo) ? (
            <Button
              small
              variant="secondary"
              icon="trash"
              label={t('bodyAddon.recipes.removePhoto')}
              onPress={() => draft.set({ photo: { kind: 'removed' } })}
            />
          ) : null}
        </View>
      </View>

      <TextField
        label={t('bodyAddon.recipes.note')}
        hint={t('bodyAddon.recipes.noteHint')}
        value={draft.note}
        onChangeText={(note) => draft.set({ note })}
        multiline
      />

      <Text variant="heading">{t('bodyAddon.recipes.ingredients')}</Text>
      {draft.ingredients.length === 0 ? (
        <Text tone="secondary">{t('bodyAddon.recipes.noIngredients')}</Text>
      ) : (
        <Card style={styles.list} testID="recipe-ingredients">
          {draft.ingredients.map((i) => (
            <IngredientRow
              key={i.key}
              ingredient={i}
              open={open === i.key}
              onToggle={() => setOpen(open === i.key ? null : i.key)}
            />
          ))}
          {fromOff ? <OffAttribution /> : null}
        </Card>
      )}
      <Button
        variant="secondary"
        icon="plus"
        label={t('bodyAddon.recipes.addIngredient')}
        testID="recipe-add-ingredient"
        onPress={() =>
          router.push({ pathname: '/body/food/add', params: flowParams(meal, day, 'ingredient') })
        }
      />

      <Stepper
        label={t('bodyAddon.recipes.portionsLabel')}
        value={draft.portions}
        min={1}
        max={MAX_PORTIONS}
        onChange={(portions) => draft.set({ portions })}
        decreaseLabel={t('bodyAddon.recipes.portionsFewer')}
        increaseLabel={t('bodyAddon.recipes.portionsMore')}
      />
      <TextField
        label={t('bodyAddon.recipes.cookedWeight')}
        hint={t('bodyAddon.recipes.cookedWeightHint')}
        suffix="g"
        keyboardType="decimal-pad"
        value={cooked}
        onChangeText={setCooked}
        testID="recipe-cooked"
      />

      {summary ? (
        <View style={styles.stack} testID="recipe-totals">
          <Card style={styles.stack} testID="recipe-total">
            <Text variant="label">{t('bodyAddon.recipes.wholeDishTitle')}</Text>
            <Text style={numeric}>{nutrientsText(t, summary.total)}</Text>
            <Text variant="caption" tone="secondary" style={numeric}>
              {summary.cookedWeightG
                ? `${t('bodyAddon.recipes.rawWeight', { grams: summary.rawWeightG })} · ${t(
                    'bodyAddon.recipes.cookedWeightLine',
                    { grams: summary.cookedWeightG },
                  )}`
                : t('bodyAddon.recipes.rawWeight', { grams: summary.rawWeightG })}
            </Text>
          </Card>
          <Card style={styles.stack} testID="recipe-portion">
            <Text variant="label">
              {summary.portionG
                ? t('bodyAddon.recipes.perPortionWeight', { grams: summary.portionG })
                : t('bodyAddon.recipes.perPortion')}
            </Text>
            <Text variant="heading" style={numeric}>
              {t('bodyAddon.kcal', { kcal: summary.perPortion.kcal })}
            </Text>
            <Text tone="secondary" style={numeric}>
              {t('bodyAddon.diary.macros', {
                p: summary.perPortion.proteinG,
                c: summary.perPortion.carbsG,
                f: summary.perPortion.fatG,
              })}
            </Text>
          </Card>
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.errorText }}>{error}</Text> : null}
      <Button
        label={t('bodyAddon.recipes.save')}
        testID="recipe-save"
        disabled={save.isPending}
        onPress={() => submit(false)}
      />
      {draft.id ? (
        <Button
          variant="secondary"
          label={t('bodyAddon.recipes.saveAsNew')}
          testID="recipe-save-new"
          disabled={save.isPending}
          onPress={() => submit(true)}
        />
      ) : null}
    </Screen>
  );
}

/** One ingredient: name and amount; a tap opens the amount (in the unit it was entered in). */
function IngredientRow({
  ingredient: i,
  open,
  onToggle,
}: {
  ingredient: DraftIngredient;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const update = useRecipeDraft((d) => d.updateIngredient);
  const remove = useRecipeDraft((d) => d.removeIngredient);
  const counted = (i.unit === 'piece' || i.unit === 'portion') && i.count ? i.count : null;
  const [value, setValue] = useState(String(counted ?? i.amount));
  const text = ingredientText(t, i);

  const apply = (v: string) => {
    setValue(v);
    const n = parse(v);
    if (n === null) return;
    // Pieces and portions keep their size per unit; grams and millilitres are the amount.
    if (counted)
      update(i.key, { count: n, amount: Math.round((i.amount / counted) * n * 10) / 10 });
    else update(i.key, { amount: n });
  };

  return (
    <View
      style={[styles.ingredient, { borderColor: colors.border }]}
      testID={`ingredient-${i.key}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${i.name}, ${text}`}
        onPress={onToggle}
        style={styles.row}
      >
        <Text style={styles.flex}>{i.name}</Text>
        <Text tone="secondary" style={numeric}>
          {text}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label={
                counted
                  ? t('bodyAddon.recipes.countOf', {
                      unit:
                        i.unit === 'piece'
                          ? t('bodyAddon.food.piece')
                          : (i.portionLabel ?? t('bodyAddon.recipes.portion')),
                    })
                  : t('bodyAddon.recipes.amountOf', { name: i.name })
              }
              suffix={counted ? undefined : (i.basis ?? 'g')}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={apply}
              testID={`ingredient-amount-${i.key}`}
            />
          </View>
          <Button
            small
            variant="secondary"
            icon="trash"
            label={t('bodyAddon.recipes.removeIngredient')}
            onPress={() => remove(i.key)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  list: { gap: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  ingredient: { gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  photo: {
    width: 120,
    height: 160,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
