import { useEffect, useRef, useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import { useT } from '../../i18n';
import { showToast } from '../common/Toast';
import { sendTaskChatMessage } from '../../services/chat';
import {
  startTripRecording, exportRecording, deleteRecording, listRecordings,
  type TripRecorder, type TripRecordingMeta,
} from '../../services/trip-audio';

interface TripAudioRecorderProps {
  taskId: string;
  counterpartyPubkey?: string | null;
}

/**
 * Opt-in trip audio recording — device-local and operator-blind. Shows the
 * jurisdiction-honest consent note before the first tap, notifies the
 * counterparty over the E2E chat when recording starts, auto-stops when the
 * trip screen unmounts, and offers export/delete of this trip's recording.
 */
export function TripAudioRecorder({ taskId, counterpartyPubkey }: TripAudioRecorderProps) {
  const { t } = useT();
  const { identity } = useIdentity();
  const [confirming, setConfirming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState<TripRecordingMeta | null>(null);
  const recorderRef = useRef<TripRecorder | null>(null);

  // Surface an existing recording for this task (e.g. after a refresh)
  useEffect(() => {
    let stale = false;
    void listRecordings().then((all) => {
      const mine = all.find((r) => r.taskId === taskId);
      if (!stale && mine) setSaved(mine);
    });
    return () => { stale = true; };
  }, [taskId]);

  // Auto-stop and save when the trip screen goes away
  useEffect(() => () => {
    const active = recorderRef.current;
    if (active?.isRecording()) {
      void active.stop();
    }
  }, []);

  if (!identity) return null;

  const start = async () => {
    setConfirming(false);
    try {
      const recorder = await startTripRecording(identity.privKeyHex, taskId);
      recorderRef.current = recorder;
      setRecording(true);
      // All-party-informed: tell the counterparty in the E2E chat.
      // Best-effort — recording is the rider's right in one-party
      // jurisdictions and the notice is the honest default everywhere.
      if (counterpartyPubkey) {
        void sendTaskChatMessage(
          identity.privKeyHex, counterpartyPubkey, taskId, t('audio.chatNotice'),
        ).catch(() => {});
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Recording failed', { type: 'error' });
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!recorder) return;
    const meta = await recorder.stop();
    if (meta) {
      setSaved(meta);
      showToast(t('audio.saved'));
    }
  };

  const download = async () => {
    const result = await exportRecording(identity.privKeyHex, taskId);
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donkeyride-${taskId}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async () => {
    await deleteRecording(taskId);
    setSaved(null);
  };

  return (
    <div className="meta-card">
      {recording ? (
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-donkey-red animate-pulse" aria-hidden />
          <span className="flex-1 text-sm text-donkey-text font-semibold">{t('audio.recording')}</span>
          <button className="btn-secondary text-xs px-3" onClick={stop}>
            {t('audio.stop')}
          </button>
        </div>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-donkey-muted">{t('audio.consent')}</p>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 text-xs" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary flex-1 text-xs" onClick={start}>
              {t('audio.start')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="text-donkey-blue text-sm font-semibold"
            onClick={() => setConfirming(true)}
          >
            🎙 {t('audio.record')}
          </button>
          {saved && (
            <span className="flex items-center gap-2 text-xs text-donkey-muted ml-auto">
              {t('audio.savedShort')}
              <button className="text-donkey-blue font-semibold" onClick={download}>
                {t('audio.download')}
              </button>
              <button className="text-donkey-muted underline" onClick={remove}>
                {t('audio.delete')}
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
