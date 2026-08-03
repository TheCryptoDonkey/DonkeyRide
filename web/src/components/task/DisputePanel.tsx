import { useState } from 'react';
import { raiseDispute, type DisputeType } from '../../services/api';
import { showToast } from '../../components/common/Toast';
import { useDomain } from '../../context/DomainContext';
import { useT } from '../../i18n';
import type { Task } from '../../types/api';

const DISPUTE_TYPES: DisputeType[] = ['payment', 'quality', 'conduct', 'safety', 'no_show'];

interface DisputePanelProps {
  task: Pick<Task, 'id' | 'requesterPubkey' | 'providerPubkey' | 'operatorBase'>;
  /** Which side is complaining — decides who the respondent is */
  role: 'requester' | 'provider';
  onDone?: () => void;
}

/**
 * Something went wrong with this job.
 *
 * The operator has had a complete dispute subsystem — claims, evidence,
 * arbiter assignment, resolutions, appeals — with no way for a participant
 * to reach any of it. The claim is a kind 7543 event signed by the person
 * making it, exactly like a rating: the operator arbitrates, it never
 * authors the complaint, and the signed claim outlives this operator.
 */
export function DisputePanel({ task, role, onDone }: DisputePanelProps) {
  const { t } = useT();
  const { profile } = useDomain();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DisputeType>('quality');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const respondent = role === 'requester' ? task.providerPubkey : task.requesterPubkey;

  const submit = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    try {
      await raiseDispute(task.id, {
        disputeType: type,
        description: description.trim(),
        respondentPubkey: respondent,
        domainId: profile?.id,
      }, task.operatorBase);
      setSent(true);
      showToast(t('dispute.sent'));
      onDone?.();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t('dispute.failed'),
        { type: 'error' },
      );
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="meta-card">
        <p className="text-sm font-semibold text-donkey-green">{t('dispute.sentTitle')}</p>
        <p className="text-xs text-donkey-muted mt-1">{t('dispute.sentBody')}</p>
        <p className="text-xs font-mono text-donkey-muted mt-2 break-all">{task.id}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="btn-secondary w-full text-sm"
        onClick={() => setOpen(true)}
      >
        {t('dispute.open')}
      </button>
    );
  }

  return (
    <div className="meta-card border border-donkey-orange/40 space-y-3">
      <div>
        <p className="meta-label">{t('dispute.title')}</p>
        <p className="text-xs text-donkey-muted mt-1">{t('dispute.intro')}</p>
      </div>

      <fieldset>
        <legend className="meta-label mb-2">{t('dispute.whatHappened')}</legend>
        <div className="flex flex-wrap gap-2">
          {DISPUTE_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={type === option}
              className={`text-xs font-semibold px-3 min-h-[36px] rounded-full border transition-colors ${
                type === option
                  ? 'border-donkey-orange bg-donkey-orange/10 text-donkey-orange'
                  : 'border-donkey-border text-donkey-muted'
              }`}
              onClick={() => setType(option)}
            >
              {t(`dispute.type.${option}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="meta-label">{t('dispute.describe')}</span>
        <textarea
          className="input-field w-full text-sm mt-1"
          rows={3}
          maxLength={1000}
          value={description}
          placeholder={t('dispute.describePlaceholder')}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <p className="text-xs text-donkey-muted">{t('dispute.signedNote')}</p>

      <div className="flex gap-3">
        <button className="btn-secondary flex-1" disabled={busy} onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
        <button
          className="btn-primary flex-1"
          disabled={busy || !description.trim()}
          onClick={() => void submit()}
        >
          {busy ? t('dispute.sending') : t('dispute.submit')}
        </button>
      </div>
    </div>
  );
}
