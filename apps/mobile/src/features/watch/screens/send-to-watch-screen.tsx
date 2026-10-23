import { findWorkout } from '@peakr/engine';
import type { WatchFailure } from '@peakr/watch';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useIntegrations } from '@/features/integrations/queries';
import { usePlan } from '@/features/plan/queries';
import { useRoute } from '@/features/routes/queries';
import { planHrZones } from '@/features/training-zones/resolve';
import { Button, Card, Screen, Text } from '@/ui';

import { plannedWatchWorkouts } from '@peakr/watch';
import { todayIso } from '@/data/ids';
import { routeFile, shareFile, watchRouteOf, workoutFiles, type WorkoutFiles } from '../export';
import { directEnabled, isDirect } from '../options';
import { useWatchChoice } from '../queries';
import { createRemoteWatchProvider } from '../remote-provider';

/**
 * "Watch" action of a workout. Always available: the .FIT workout file (and the route as .GPX) to
 * share into Garmin Connect or any other watch app. Where the chosen platform's direct sync is on
 * and connected, the workout can also go straight to the watch.
 */
export function SendToWatchScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: stored } = usePlan();
  const { data: choice } = useWatchChoice();
  const userId = useSessionStore(selectAccountUserId);
  const { data: integrations } = useIntegrations(userId);
  const workout = stored ? findWorkout(stored.state.plan, id) : undefined;
  const { data: route } = useRoute(workout?.routeId);
  const [files, setFiles] = useState<WorkoutFiles | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const profile = stored?.input.profile;
  const hrZones = stored ? planHrZones(stored.input) : [];
  useEffect(() => {
    if (!workout || !profile) return;
    let cancelled = false;
    void workoutFiles(workout, {
      profile,
      hrZones: planHrZones(stored?.input),
      ...(route && workout.sport === 'run' ? { routeProfile: route.profile } : {}),
    }).then((result) => {
      if (!cancelled) setFiles(result);
    });
    return () => {
      cancelled = true;
    };
    // The files only depend on the workout, the profile/zones and the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, profile, route]);

  if (!stored || !workout || !profile) return <Screen />;

  const direct = choice && isDirect(choice) && directEnabled(choice) ? choice : null;
  const name = direct ? t(`watch.options.${direct}`) : '';
  const connected =
    direct !== null &&
    (integrations?.some((i) => i.provider === direct && i.status === 'active') ?? false);
  const routable = workout.sport === 'run' || workout.sport === 'bike';

  const shareAll = async () => {
    if (!files?.ok) return;
    setBusy(true);
    setMessage(null);
    try {
      for (const file of files.files) {
        if ((await shareFile(file)) === 'failed') {
          setMessage(t('watch.send.shareFailed'));
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const shareRoute = async () => {
    if (!route || (route.sport !== 'run' && route.sport !== 'bike')) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await shareFile(
        routeFile(watchRouteOf({ ...route, sport: route.sport, profile: route.profile })),
      );
      if (result === 'failed') setMessage(t('watch.send.shareFailed'));
    } finally {
      setBusy(false);
    }
  };

  const reason = (failure: WatchFailure) => t(`watch.send.reasons.${failure}`, { watch: name });

  const sendDirect = async () => {
    if (!direct) return;
    setBusy(true);
    setMessage(null);
    try {
      // The whole window goes (not just this workout): the server keeps the watch in step.
      const workouts = plannedWatchWorkouts(
        {
          state: stored.state,
          profile,
          hrZones,
          ...(route ? { routeProfiles: { [route.id]: route.profile } } : {}),
        },
        todayIso(),
      );
      const result = await createRemoteWatchProvider(direct).pushWorkouts(workouts);
      setMessage(
        result.ok
          ? t('watch.send.done', { watch: name })
          : t('watch.send.failed', { reason: reason(result.failure) }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {files && !files.ok ? <Text>{t('watch.send.notExportable')}</Text> : null}
      {files?.ok ? (
        <Card>
          <Text variant="label">{t('watch.send.fileTitle')}</Text>
          <Text tone="secondary">{t('watch.send.fileBody')}</Text>
          {files.files.length > 1 ? (
            <Text variant="caption" tone="secondary">
              {t('watch.send.brickLegs')}
            </Text>
          ) : null}
          <Button
            icon="watch"
            label={t('watch.send.fileButton')}
            disabled={busy}
            onPress={() => void shareAll()}
          />
        </Card>
      ) : null}
      {routable && route ? (
        <Card>
          <Text variant="label">{t('watch.send.routeTitle')}</Text>
          <Text tone="secondary">{t('watch.send.routeBody')}</Text>
          <Button
            variant="secondary"
            icon="route"
            label={t('watch.send.routeButton')}
            disabled={busy}
            onPress={() => void shareRoute()}
          />
        </Card>
      ) : null}
      {direct ? (
        <Card>
          <Text variant="label">{t('watch.send.directTitle')}</Text>
          {connected ? (
            <Button
              label={t('watch.send.directButton', { watch: name })}
              disabled={busy || !files?.ok}
              onPress={() => void sendDirect()}
            />
          ) : (
            <Button
              variant="secondary"
              label={t('watch.send.directConnect', { watch: name })}
              onPress={() => router.push('/watch')}
            />
          )}
        </Card>
      ) : choice && isDirect(choice) ? (
        <Text variant="caption" tone="secondary">
          {t('watch.send.directSoon', { watch: t(`watch.options.${choice}`) })}
        </Text>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    </Screen>
  );
}
