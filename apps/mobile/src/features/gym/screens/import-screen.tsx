import { CSV_FIELDS, REQUIRED_CSV_FIELDS, type CsvField, type CsvMapping } from '@peakr/engine';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { newId } from '@/data/ids';
import {
  getImportNames,
  listExternalIds,
  saveImportNames,
} from '@/data/repositories/gym-repository';
import {
  Badge,
  Button,
  Card,
  CheckRow,
  ChipGroup,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  useTheme,
} from '@/ui';

import { ExercisePicker } from '../exercise-picker';
import { exerciseLabel, matchCandidates } from '../exercise-text';
import {
  buildGymImport,
  matchNames,
  parseFile,
  preview,
  type NameChoice,
  type NameMatch,
  type ParsedFile,
} from '../import-flow';
import { useFolders, useGymExercises, useGymRoutines, useSaveGymImport } from '../queries';

type Step =
  | { kind: 'pick'; error?: string }
  | { kind: 'map'; file: ParsedFile; mapping: CsvMapping }
  | { kind: 'match'; file: ParsedFile; mapping: CsvMapping; names: NameMatch[] }
  | {
      kind: 'done';
      sessions: number;
      sets: number;
      exercises: number;
      routines: number;
      skipped: number;
    };

const NONE = 'none';

/** Reads the CSV export of another gym app as text; null when the user cancels. */
async function pickCsv(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Exports come as CSV, plain text or a generic binary; the parser checks the content.
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? new File(asset.uri).text() : null;
}

/**
 * Gym → Import: bring the history from another gym app across via its CSV export – column mapping
 * with a preview, fuzzy exercise matching, unmatched names become custom exercises.
 */
export function ImportScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const custom = useGymExercises();

  const choose = async () => {
    const text = await pickCsv();
    if (text === null) return;
    const file = parseFile(text);
    if (!file) setStep({ kind: 'pick', error: t('gym.import.empty') });
    else setStep({ kind: 'map', file, mapping: file.mapping });
  };

  switch (step.kind) {
    case 'pick':
      return (
        <Screen>
          <Text>{t('gym.import.intro')}</Text>
          <Text variant="caption" tone="secondary">
            {t('gym.import.howToExport')}
          </Text>
          {step.error ? (
            <Text accessibilityLiveRegion="polite" testID="import-error">
              {step.error}
            </Text>
          ) : null}
          <Button icon="upload" label={t('gym.import.choose')} onPress={() => void choose()} />
        </Screen>
      );
    case 'map':
      return (
        <MappingStep
          file={step.file}
          mapping={step.mapping}
          onChange={(mapping) => setStep({ ...step, mapping })}
          onNext={async (rows) => {
            const known = await getImportNames();
            setStep({
              kind: 'match',
              file: step.file,
              mapping: step.mapping,
              names: matchNames(rows, matchCandidates(t, custom.data ?? []), known),
            });
          }}
          onBack={() => setStep({ kind: 'pick' })}
        />
      );
    case 'match':
      return (
        <MatchStep
          file={step.file}
          mapping={step.mapping}
          names={step.names}
          onChange={(names) => setStep({ ...step, names })}
          onDone={(result) => setStep({ kind: 'done', ...result })}
        />
      );
    case 'done':
      return (
        <Screen>
          <Card style={styles.card} testID="import-done">
            <Text variant="heading">{t('gym.import.doneTitle')}</Text>
            <Text>{t('gym.import.doneSessions', { count: step.sessions, sets: step.sets })}</Text>
            {step.exercises > 0 ? (
              <Text>{t('gym.import.doneExercises', { count: step.exercises })}</Text>
            ) : null}
            {step.routines > 0 ? (
              <Text>{t('gym.import.doneRoutines', { count: step.routines })}</Text>
            ) : null}
            {step.skipped > 0 ? (
              <Text tone="secondary">{t('gym.import.doneSkipped', { count: step.skipped })}</Text>
            ) : null}
          </Card>
          <Button label={t('gym.import.backToGym')} onPress={() => router.back()} />
        </Screen>
      );
  }
}

function MappingStep({
  file,
  mapping,
  onChange,
  onNext,
  onBack,
}: {
  file: ParsedFile;
  mapping: CsvMapping;
  onChange: (mapping: CsvMapping) => void;
  onNext: (rows: ReturnType<typeof preview>['rows']) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const p = preview(file, mapping);
  const columnOptions = [
    { value: NONE, label: t('gym.import.noColumn') },
    ...file.table.headers.map((h, i) => ({ value: String(i), label: h || `#${i + 1}` })),
  ];
  const setColumn = (field: CsvField, value: string) => {
    const columns = { ...mapping.columns };
    if (value === NONE) delete columns[field];
    else columns[field] = Number(value);
    onChange({ ...mapping, columns });
  };

  return (
    <Screen>
      {file.preset ? (
        <Badge label={t(`gym.import.preset.${file.preset}`)} />
      ) : (
        <Text tone="secondary">{t('gym.import.noPreset')}</Text>
      )}
      <Card style={styles.card} testID="import-preview">
        <Text variant="heading">{t('gym.import.previewTitle')}</Text>
        {p.missing.length > 0 ? (
          <Text>
            {t('gym.import.missing', {
              fields: p.missing.map((f) => t(`gym.import.fields.${f as CsvField}`)).join(', '),
            })}
          </Text>
        ) : (
          <>
            <Text>
              {t('gym.import.previewCounts', { sessions: p.drafts.length, sets: p.rows.length })}
            </Text>
            {p.firstDate && p.lastDate ? (
              <Text variant="caption" tone="secondary">
                {t('gym.import.previewRange', { from: p.firstDate, to: p.lastDate })}
              </Text>
            ) : null}
            {p.rows.slice(0, 5).map((r) => (
              <Text key={r.line} variant="caption">
                {[
                  r.exerciseName,
                  r.weightKg !== undefined
                    ? t('gym.import.kg', { value: Math.round(r.weightKg * 10) / 10 })
                    : null,
                  r.reps !== undefined ? `× ${r.reps}` : null,
                  r.durationSec !== undefined
                    ? t('strength.seconds', { count: r.durationSec })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            ))}
            {p.issues.length > 0 ? (
              <Text variant="caption" tone="secondary">
                {t('gym.import.issues', {
                  count: p.issues.length,
                  lines: p.issues
                    .slice(0, 5)
                    .map((i) => i.line)
                    .join(', '),
                })}
              </Text>
            ) : null}
          </>
        )}
      </Card>
      <Text variant="heading">{t('gym.import.columns')}</Text>
      {CSV_FIELDS.map((field) => (
        <ChipGroup
          key={field}
          label={`${t(`gym.import.fields.${field}`)}${REQUIRED_CSV_FIELDS.includes(field) ? ' *' : ''}`}
          options={columnOptions}
          selected={[mapping.columns[field] === undefined ? NONE : String(mapping.columns[field])]}
          onToggle={(value) => setColumn(field, value)}
        />
      ))}
      <Text variant="caption" style={styles.label}>
        {t('gym.import.weightUnit')}
      </Text>
      <SegmentedControl
        options={[
          { value: 'kg', label: t('units.kg') },
          { value: 'lb', label: t('gym.import.lb') },
        ]}
        value={mapping.weightUnit}
        onChange={(weightUnit) => onChange({ ...mapping, weightUnit })}
      />
      <Text variant="caption" style={styles.label}>
        {t('gym.import.distanceUnit')}
      </Text>
      <SegmentedControl
        options={[
          { value: 'km', label: 'km' },
          { value: 'mi', label: 'mi' },
          { value: 'm', label: 'm' },
        ]}
        value={
          mapping.distanceUnit === 'mi' || mapping.distanceUnit === 'm'
            ? mapping.distanceUnit
            : 'km'
        }
        onChange={(distanceUnit) => onChange({ ...mapping, distanceUnit })}
      />
      <CheckRow
        label={t('gym.import.dayFirst')}
        checked={mapping.dayFirst}
        onChange={(dayFirst) => onChange({ ...mapping, dayFirst })}
      />
      <Button
        label={t('gym.import.next')}
        disabled={p.missing.length > 0 || p.rows.length === 0}
        onPress={() => void onNext(p.rows)}
      />
      <Button variant="secondary" label={t('gym.import.otherFile')} onPress={onBack} />
    </Screen>
  );
}

function MatchStep({
  file,
  mapping,
  names,
  onChange,
  onDone,
}: {
  file: ParsedFile;
  mapping: CsvMapping;
  names: NameMatch[];
  onChange: (names: NameMatch[]) => void;
  onDone: (result: {
    sessions: number;
    sets: number;
    exercises: number;
    routines: number;
    skipped: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const custom = useGymExercises().data ?? [];
  const routines = useGymRoutines().data ?? [];
  const folders = useFolders().data ?? [];
  const save = useSaveGymImport();
  const [picking, setPicking] = useState<string | null>(null);
  const [createRoutines, setCreateRoutines] = useState(false);
  const [busy, setBusy] = useState(false);

  const setChoice = (name: string, choice: NameChoice) =>
    onChange(names.map((n) => (n.match.name === name ? { ...n, choice } : n)));

  if (picking) {
    return (
      <Screen>
        <Text tone="secondary">{t('gym.import.pickFor', { name: picking })}</Text>
        <ExercisePicker
          custom={custom}
          onPick={(id) => {
            setChoice(picking, { kind: 'exercise', id });
            setPicking(null);
          }}
          onCreate={() => {
            setChoice(picking, { kind: 'custom' });
            setPicking(null);
          }}
          onCancel={() => setPicking(null)}
        />
      </Screen>
    );
  }

  const run = async () => {
    setBusy(true);
    const p = preview(file, mapping);
    const source =
      file.preset === 'hevy'
        ? 'import:hevy'
        : file.preset === 'strong'
          ? 'import:strong'
          : 'import:csv';
    const result = buildGymImport(p.drafts, names, {
      preset: file.preset,
      newId,
      existingExternalIds: await listExternalIds(source),
      createRoutines,
      routineFolderName: t('gym.import.routineFolder'),
      routinePosition: routines.length,
      folderPosition: folders.length,
    });
    save.mutate(result.data, {
      onSuccess: async () => {
        await saveImportNames({ ...(await getImportNames()), ...result.knownNames });
        onDone({
          sessions: result.data.sessions.length,
          sets: result.data.sets.length,
          exercises: result.data.exercises.length,
          routines: result.data.routines.length,
          skipped: result.skipped,
        });
      },
      onSettled: () => setBusy(false),
    });
  };

  const counts = {
    matched: names.filter((n) => n.match.status === 'matched').length,
    review: names.filter((n) => n.match.status !== 'matched').length,
  };

  return (
    <Screen>
      <Text>{t('gym.import.matchIntro', counts)}</Text>
      {names.map((n) => {
        const options = [
          ...n.match.suggestions.map((s) => ({
            value: `ex:${s.id}`,
            label: exerciseLabel(t, s.id, custom),
          })),
          ...(n.choice.kind === 'exercise' &&
          !n.match.suggestions.some((s) => s.id === (n.choice as { id: string }).id)
            ? [{ value: `ex:${n.choice.id}`, label: exerciseLabel(t, n.choice.id, custom) }]
            : []),
          { value: 'custom', label: t('gym.import.asCustom') },
          { value: 'skip', label: t('gym.import.skip') },
        ];
        const selected = n.choice.kind === 'exercise' ? `ex:${n.choice.id}` : n.choice.kind;
        return (
          <Card
            key={n.match.name}
            style={[
              styles.card,
              n.match.status !== 'matched'
                ? { borderLeftWidth: 4, borderLeftColor: colors.warning }
                : null,
            ]}
            accessibilityLabel={n.match.name}
          >
            <Text style={styles.name}>{n.match.name}</Text>
            <Text variant="caption" tone="secondary">
              {[
                t(`gym.import.status.${n.match.status}`),
                t('gym.import.setCount', { count: n.sets }),
              ].join(' · ')}
            </Text>
            <ChipGroup
              label={t('gym.import.mapTo')}
              options={options}
              selected={[selected]}
              onToggle={(value) =>
                setChoice(
                  n.match.name,
                  value === 'custom' || value === 'skip'
                    ? { kind: value }
                    : { kind: 'exercise', id: value.slice('ex:'.length) },
                )
              }
            />
            <Button
              small
              variant="secondary"
              icon="search"
              label={t('gym.import.searchLibrary')}
              onPress={() => setPicking(n.match.name)}
            />
          </Card>
        );
      })}
      <CheckRow
        label={t('gym.import.createRoutines')}
        checked={createRoutines}
        onChange={setCreateRoutines}
      />
      <Button label={t('gym.import.run')} disabled={busy} onPress={() => void run()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  name: { fontWeight: '600' },
  label: { fontWeight: '600' },
});
