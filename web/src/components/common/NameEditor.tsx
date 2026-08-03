import { useEffect, useState } from 'react';
import { useIdentity } from '../../context/IdentityContext';
import { getProfile, publishProfile } from '../../services/profiles';
import { showToast } from './Toast';
import { useT } from '../../i18n';

/**
 * The name the other party sees.
 *
 * Published as the user's own kind 0 metadata to public relays — the same
 * event every Nostr client uses — so it travels with the recovery key to any
 * operator, and this operator neither stores nor asserts it. Optional by
 * design: an unnamed account still works, it just shows an identifier.
 */
export function NameEditor() {
  const { t } = useT();
  const { identity } = useIdentity();
  const [name, setName] = useState('');
  const [picture, setPicture] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    let live = true;
    void getProfile(identity.pubKeyHex)
      .then((p) => {
        if (!live) return;
        setName(p.name || '');
        setPicture(p.picture || '');
        setLoaded(true);
      })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [identity]);

  const save = async () => {
    if (!identity || saving) return;
    setSaving(true);
    setError(null);
    try {
      const relays = await publishProfile(identity.privKeyHex, identity.pubKeyHex, {
        name,
        picture,
      });
      if (relays === 0) throw new Error(t('name.noRelays'));
      showToast(t('name.saved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('name.failed');
      setError(message);
      showToast(message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!identity) return null;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-donkey-muted">
          {t('name.title')}
        </h2>
        <p className="text-xs text-donkey-muted mt-1">{t('name.hint')}</p>
      </div>

      <label className="block">
        <span className="meta-label">{t('name.nameLabel')}</span>
        <input
          type="text"
          className="input-field w-full mt-1"
          value={name}
          maxLength={40}
          disabled={!loaded}
          placeholder={t('name.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="meta-label">{t('name.pictureLabel')}</span>
        <input
          type="url"
          inputMode="url"
          className="input-field w-full mt-1"
          value={picture}
          disabled={!loaded}
          placeholder="https://..."
          onChange={(e) => setPicture(e.target.value)}
        />
      </label>

      <button className="btn-secondary w-full" onClick={save} disabled={saving || !loaded}>
        {saving ? t('name.saving') : t('name.save')}
      </button>

      {error && <p className="text-donkey-red text-xs">{error}</p>}
      <p className="text-xs text-donkey-muted">{t('name.storage')}</p>
    </section>
  );
}
