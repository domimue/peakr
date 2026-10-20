import {
  duplicateRoutine,
  routineMinutes,
  starterRoutines,
  STARTER_SPLITS,
  type GymRoutine,
  type RoutineFolder,
  type StarterSplit,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import {
  Button,
  Card,
  ChipGroup,
  IconButton,
  ListState,
  Screen,
  SortableList,
  spacing,
  Text,
  TextField,
  useTheme,
} from '@/ui';

import {
  useDeleteFolder,
  useFolders,
  useGymRoutines,
  useSaveFolder,
  useSaveGymRoutines,
  useSaveStarterRoutines,
} from '../queries';

const UNFILED = 'none';

/** Gym → Routines: folders, drag to reorder, duplicate, archive, and starter splits (§8.2). */
export function RoutineListScreen() {
  const { t } = useTranslation();
  const routines = useGymRoutines();
  const folders = useFolders();
  const saveRoutines = useSaveGymRoutines();
  const [showArchived, setShowArchived] = useState(false);
  const [folderDraft, setFolderDraft] = useState<RoutineFolder | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);

  if (routines.isPending || folders.isPending) {
    return (
      <Screen>
        <ListState kind="loading" label={t('common.loading')} />
      </Screen>
    );
  }
  const all = routines.data ?? [];
  const folderList = folders.data ?? [];
  const active = all.filter((r) => r.archivedAt === undefined);
  const archived = all.filter((r) => r.archivedAt !== undefined);
  const knownFolders = new Set(folderList.map((f) => f.id));
  const inFolder = (folderId: string) =>
    active.filter((r) =>
      folderId === UNFILED ? !r.folderId || !knownFolders.has(r.folderId) : r.folderId === folderId,
    );

  /** Writes new positions for one folder's routines after a drag. */
  const reorder = (list: readonly GymRoutine[], from: number, to: number) => {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    saveRoutines.mutate(next.map((r, position) => ({ ...r, position })));
  };
  const update = (r: GymRoutine) => saveRoutines.mutate([r]);

  const section = (folderId: string, title: string | null, folder?: RoutineFolder) => {
    const list = inFolder(folderId);
    if (folderId === UNFILED && list.length === 0 && folderList.length > 0) return null;
    return (
      <View key={folderId} style={styles.section}>
        {title ? (
          <View style={styles.folderHead}>
            <Text variant="heading" style={styles.flex}>
              {title}
            </Text>
            {folder ? (
              <IconButton
                icon="edit"
                accessibilityLabel={t('gym.routines.renameFolder', { name: folder.name })}
                onPress={() => setFolderDraft(folder)}
              />
            ) : null}
          </View>
        ) : null}
        {list.length === 0 ? (
          <Text variant="caption" tone="secondary">
            {t('gym.routines.emptyFolder')}
          </Text>
        ) : (
          <SortableList
            testID={`routines-${folderId}`}
            items={list}
            keyOf={(r) => r.id}
            moveUpLabel={t('gym.builder.moveUp')}
            moveDownLabel={t('gym.builder.moveDown')}
            onMove={(from, to) => reorder(list, from, to)}
            renderItem={(r) => (
              <RoutineCard
                routine={r}
                folders={folderList}
                expanded={actionsFor === r.id}
                onToggleActions={() => setActionsFor(actionsFor === r.id ? null : r.id)}
                onDuplicate={() => {
                  setActionsFor(null);
                  update(duplicateRoutine(r, newId, t('gym.routines.copyName', { name: r.name })));
                }}
                onArchive={() => {
                  setActionsFor(null);
                  update({ ...r, archivedAt: Date.now() });
                }}
                onMoveToFolder={(target) => {
                  const rest = { ...r };
                  delete rest.folderId;
                  update(target === UNFILED ? rest : { ...rest, folderId: target });
                }}
              />
            )}
          />
        )}
        <Button
          small
          variant="secondary"
          icon="plus"
          label={t('strength.routines.new')}
          onPress={() =>
            router.push({
              pathname: '/gym/routines/[id]',
              params: { id: 'new', ...(folder ? { folderId: folder.id } : {}) },
            })
          }
        />
      </View>
    );
  };

  return (
    <Screen>
      <Text tone="secondary">{t('strength.routines.intro')}</Text>
      {all.length === 0 ? <StarterRoutines existingFolders={folderList.length} /> : null}
      {section(UNFILED, folderList.length > 0 ? t('gym.routines.noFolder') : null)}
      {folderList.map((f) => section(f.id, f.name, f))}

      {folderDraft ? (
        <FolderEditor
          folder={folderDraft}
          isNew={!folderList.some((f) => f.id === folderDraft.id)}
          onDone={() => setFolderDraft(null)}
        />
      ) : (
        <Button
          variant="secondary"
          icon="folder"
          label={t('gym.routines.newFolder')}
          onPress={() => setFolderDraft({ id: newId(), name: '', position: folderList.length })}
        />
      )}

      {all.length > 0 ? <StarterRoutines existingFolders={folderList.length} compact /> : null}

      {archived.length > 0 ? (
        <View style={styles.section}>
          <Button
            variant="secondary"
            icon="archive"
            label={
              showArchived
                ? t('gym.routines.hideArchived')
                : t('gym.routines.showArchived', { count: archived.length })
            }
            onPress={() => setShowArchived(!showArchived)}
          />
          {showArchived
            ? archived.map((r) => (
                <Card key={r.id} style={styles.card}>
                  <Text style={styles.name}>{r.name}</Text>
                  <Button
                    small
                    variant="secondary"
                    label={t('gym.routines.restore')}
                    onPress={() => {
                      const rest = { ...r };
                      delete rest.archivedAt;
                      update(rest);
                    }}
                  />
                </Card>
              ))
            : null}
        </View>
      ) : null}
    </Screen>
  );
}

function RoutineCard({
  routine: r,
  folders,
  expanded,
  onToggleActions,
  onDuplicate,
  onArchive,
  onMoveToFolder,
}: {
  routine: GymRoutine;
  folders: readonly RoutineFolder[];
  expanded: boolean;
  onToggleActions: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onMoveToFolder: (folderId: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const supersets = new Set(r.exercises.flatMap((e) => (e.supersetGroup ? [e.supersetGroup] : [])));
  return (
    <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.typeStrength }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('gym.routines.openRoutine', { name: r.name })}
        onPress={() => router.push({ pathname: '/gym/routines/[id]', params: { id: r.id } })}
      >
        <Text style={styles.name}>{r.name}</Text>
        <Text variant="caption" tone="secondary">
          {[
            t('strength.routines.summary', {
              count: r.exercises.length,
              minutes: routineMinutes(r),
            }),
            supersets.size > 0 ? t('gym.routines.supersets', { count: supersets.size }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            small
            icon="play"
            label={t('strength.routines.start')}
            onPress={() => router.push({ pathname: '/gym/session', params: { routineId: r.id } })}
          />
        </View>
        <IconButton
          icon={expanded ? 'chevronUp' : 'chevronDown'}
          accessibilityLabel={t('gym.routines.moreActions', { name: r.name })}
          onPress={onToggleActions}
        />
      </View>
      {expanded ? (
        <View style={styles.more}>
          <View style={styles.actions}>
            <Button
              small
              variant="secondary"
              icon="copy"
              label={t('gym.routines.duplicate')}
              onPress={onDuplicate}
            />
            <Button
              small
              variant="secondary"
              icon="archive"
              label={t('gym.routines.archive')}
              onPress={onArchive}
            />
          </View>
          {folders.length > 0 ? (
            <ChipGroup
              label={t('gym.routines.folder')}
              options={[
                { value: UNFILED, label: t('gym.routines.noFolder') },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
              selected={[r.folderId ?? UNFILED]}
              onToggle={onMoveToFolder}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function FolderEditor({
  folder,
  isNew,
  onDone,
}: {
  folder: RoutineFolder;
  isNew: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveFolder();
  const remove = useDeleteFolder();
  const [name, setName] = useState(folder.name);
  const error = name.trim() === '' ? t('validation.required') : undefined;
  return (
    <Card style={styles.card}>
      <TextField
        label={t('gym.routines.folderName')}
        value={name}
        onChangeText={setName}
        maxLength={40}
        autoFocus
      />
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            small
            label={t('common.save')}
            disabled={error !== undefined}
            onPress={() => save.mutate({ ...folder, name: name.trim() }, { onSuccess: onDone })}
          />
        </View>
        <View style={styles.flex}>
          <Button small variant="secondary" label={t('common.cancel')} onPress={onDone} />
        </View>
      </View>
      {!isNew ? (
        <>
          <Text variant="caption" tone="secondary">
            {t('gym.routines.deleteFolderHint')}
          </Text>
          <Button
            small
            variant="danger"
            icon="trash"
            label={t('gym.routines.deleteFolder')}
            onPress={() => remove.mutate(folder.id, { onSuccess: onDone })}
          />
        </>
      ) : null}
    </Card>
  );
}

/** "Start from a split": one folder of ready routines per split, editable afterwards. */
function StarterRoutines({
  existingFolders,
  compact,
}: {
  existingFolders: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const save = useSaveStarterRoutines();
  const [open, setOpen] = useState(!compact);
  const create = (split: StarterSplit) => {
    const { folder, routines } = starterRoutines(split, {
      newId,
      folderName: t(`gym.starter.splits.${split}`),
      routineName: (type) => t(`strength.types.${type}` as never) as string,
      folderPosition: existingFolders,
    });
    save.mutate({ folder, routines });
    setOpen(false);
  };
  if (!open) {
    return (
      <Button
        variant="secondary"
        icon="sparkles"
        label={t('gym.starter.add')}
        onPress={() => setOpen(true)}
      />
    );
  }
  return (
    <Card style={styles.card} testID="starter-routines">
      <Text variant="heading">{t('gym.starter.title')}</Text>
      <Text tone="secondary">{t('gym.starter.intro')}</Text>
      {STARTER_SPLITS.map((split) => (
        <Button
          key={split}
          variant="secondary"
          label={t(`gym.starter.splits.${split}`)}
          disabled={save.isPending}
          onPress={() => create(split)}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: { gap: spacing.sm },
  name: { fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  more: { gap: spacing.sm },
  flex: { flex: 1 },
});
