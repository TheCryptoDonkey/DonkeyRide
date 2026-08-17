import { useEffect, useMemo, useState } from 'react';
import { DualPrice } from '../common/DualPrice';
import { QrCodeSvg } from './QrCodeSvg';
import { useDomain } from '../../context/DomainContext';
import { useT } from '../../i18n';
import {
  getPaymentOptions, getPayInstruction, settleRide,
} from '../../services/api';
import {
  getStoredNwcUri, setStoredNwcUri, payInvoiceViaNwc, isUnknownOutcome,
} from '../../services/nwc';
import { formatFiatAmount } from '../../services/pricing';
import type {
  Task, PaymentOptions, PaymentMethod, PayInstruction, SettlementInfo,
} from '../../types/api';

interface PayDriverProps {
  task: Task;
  /** Settlement state known to the parent (from getTask / WS updates) */
  settlement?: SettlementInfo | null;
}

const RAIL_LABELS: Record<string, string> = {
  lnaddress: 'Lightning',
  lightning: 'Lightning',
  tando: 'Tando (Lightning to M-Pesa)',
  mpesa: 'M-Pesa',
  cashu: 'Cashu (ecash)',
  card: 'Card',
  'tap-to-pay': 'Card',
  cash: 'Cash',
};

// Rendered via t('pay.honest') — kept as a key so the promise reads in
// the payer's own language

function isLightningRail(rail: string): boolean {
  return rail === 'lnaddress' || rail === 'lightning' || rail === 'tando';
}

/**
 * Rider-facing "pay the driver" panel. Loads the driver's accepted rails and
 * walks the rider through a direct, peer-to-peer payment: a Lightning invoice
 * (QR / deeplink / connected wallet), an M-Pesa Send Money with a confirmation
 * code, or cash. The operator only records the proof — it never holds funds.
 */
export function PayDriver({ task, settlement }: PayDriverProps) {
  const { profile } = useDomain();
  // The money path was English-only, which for a KES/Swahili market meant a
  // translated request screen and an English payment screen
  const { t, td } = useT();
  const providerLabel = td(profile?.roles.provider || 'driver').toLowerCase();

  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedRail, setSelectedRail] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<PayInstruction | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declaredRail, setDeclaredRail] = useState<string | null>(null);

  // Lightning
  const [preimage, setPreimage] = useState('');
  const [copied, setCopied] = useState(false);
  const [nwcUri, setNwcUri] = useState('');
  const [nwcConnected, setNwcConnected] = useState(false);
  // The wallet may or may not have paid. Never offer a one-tap retry from
  // here: paying twice is the harm this state exists to prevent.
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  // M-Pesa
  const [confirmationCode, setConfirmationCode] = useState('');

  useEffect(() => {
    setNwcConnected(!!getStoredNwcUri());
  }, []);

  useEffect(() => {
    let mounted = true;
    getPaymentOptions(task.id, task.operatorBase)
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch((err) => {
        if (mounted) setOptionsError(err instanceof Error ? err.message : t('pay.optionsFailed'));
      });
    return () => { mounted = false; };
  }, [task.id, task.operatorBase]);

  // Settlement state: parent (WS/getTask) wins, local optimistic declare backs it.
  const confirmed = settlement?.status === 'confirmed' || settlement?.confirmedByProvider === true;
  const parentDeclared = !!settlement?.status && !confirmed;
  const declared = parentDeclared || (!!declaredRail && !confirmed);
  const settledRail = settlement?.rail || declaredRail || selectedRail || 'cash';

  const amountSats = task.fareEstimateSats;

  const selectRail = async (rail: string) => {
    setSelectedRail(rail);
    setInstruction(null);
    setError(null);
    // Cleared here or the NWC path is stranded for good: with a wallet
    // connected and the outcome unknown, neither the pay button nor the
    // connect form renders, while the copy tells the payer to try again.
    // Re-selecting the rail is that retry, and the server hands back the same
    // invoice, so it cannot become a second payment.
    setOutcomeUnknown(false);
    setBusy('instruction');
    try {
      const instr = await getPayInstruction(task.id, { rail }, task.operatorBase);
      setInstruction(instr);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pay.buildFailed'));
    } finally {
      setBusy(null);
    }
  };

  const doSettle = async (rail: string, proof: { preimage?: string; confirmationCode?: string }) => {
    setBusy('settle');
    setError(null);
    try {
      const res = await settleRide(task.id, { rail, proof }, task.operatorBase);
      // A supplied proof that did not check out (e.g. a mistyped preimage) comes
      // back as 'unverified' — surface it rather than claiming success.
      if (res.settlement?.status === 'unverified') {
        setError(res.settlement.detail || t('pay.proofFailed'));
        return;
      }
      // The proof was real but covered less than the fare now owed — the fare
      // moved after the invoice was minted (waiting time, a changed
      // destination). Say so with both numbers rather than reporting it as
      // recorded and leaving the shortfall to be discovered face to face.
      if (res.settlement?.status === 'short') {
        setError(t('pay.shortfall', {
          paid: String(res.settlement.paidAmountSats ?? '?'),
          owed: String(res.settlement.expectedAmountSats ?? '?'),
        }));
        return;
      }
      setDeclaredRail(res.settlement?.rail || rail);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pay.recordFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handleCopyInvoice = async () => {
    if (!instruction?.invoice) return;
    try {
      await navigator.clipboard.writeText(instruction.invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Invoice text is shown below — manual copy still works
    }
  };

  const handleConnectWallet = () => {
    setError(null);
    try {
      // Light sanity check; the client parses fully on use.
      if (!/^nostr\+walletconnect:\/\//i.test(nwcUri.trim())) {
        throw new Error(t('pay.nwcPaste'));
      }
      setStoredNwcUri(nwcUri.trim());
      setNwcConnected(true);
      setNwcUri('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pay.nwcInvalid'));
    }
  };

  const handlePayWithNwc = async () => {
    const uri = getStoredNwcUri();
    if (!uri || !instruction?.invoice || !selectedRail) return;
    setBusy('nwc');
    setError(null);
    setOutcomeUnknown(false);
    try {
      const { preimage: pre } = await payInvoiceViaNwc(uri, instruction.invoice);
      // Keep the proof where the payer can see and resubmit it. Recording it
      // can fail on its own (the operator unreachable, say) long after the
      // money has moved, and discarding the one piece of evidence that the
      // payment happened would leave them unable to prove it.
      setPreimage(pre);
      await doSettle(selectedRail, { preimage: pre });
    } catch (err) {
      // An unknown outcome is not a failure. Saying "payment failed" here is
      // what leads a payer who DID pay to pay again.
      if (isUnknownOutcome(err)) {
        setOutcomeUnknown(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : t('pay.walletFailed'));
      }
      setBusy(null);
    }
  };

  const methods: PaymentMethod[] = useMemo(() => options?.methods || [], [options]);

  // ── Confirmed ──
  if (confirmed) {
    return (
      <div className="card text-center space-y-2">
        <p className="text-donkey-green font-bold">{t('pay.confirmed')}</p>
        <p className="text-xs text-donkey-muted">
          {t('pay.confirmedBody', {
            label: providerLabel,
            rail: RAIL_LABELS[settledRail] || settledRail,
          })}
        </p>
        <p className="text-[11px] text-donkey-muted">{t('pay.honest')}</p>
      </div>
    );
  }

  // ── Declared, waiting for the driver ──
  if (declared) {
    return (
      <div className="card text-center space-y-2">
        <p className="text-donkey-green font-bold">{t('pay.recorded')}</p>
        <p className="text-sm text-donkey-text">
          {t('pay.waitingConfirm', {
            label: providerLabel,
            rail: settledRail ? ` (${RAIL_LABELS[settledRail] || settledRail})` : '',
          })}
        </p>
        {settlement?.verified && (
          <p className="text-xs text-donkey-green">{t('pay.verifiedPreimage')}</p>
        )}
        <p className="text-[11px] text-donkey-muted">{t('pay.honest')}</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <p className="section-title">{t('pay.title', { label: providerLabel })}</p>
        <div className="mt-1"><DualPrice sats={amountSats} size="md" /></div>
        <p className="text-[11px] text-donkey-muted mt-1">{t('pay.honest')}</p>
      </div>

      {optionsError && <p className="text-donkey-red text-sm">{optionsError}</p>}

      {/* Rail chooser */}
      {!selectedRail && (
        <div className="space-y-2">
          {methods.length === 0 && !optionsError && (
            <p className="text-sm text-donkey-muted">{t('pay.loadingOptions')}</p>
          )}
          {methods.map((m) => (
            <button
              key={m.rail}
              className="btn-secondary w-full text-left flex items-center justify-between"
              onClick={() => selectRail(m.rail)}
            >
              <span className="font-bold">{RAIL_LABELS[m.rail] || m.rail}</span>
              <span className="text-xs text-donkey-muted">{t('pay.direct')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected rail flow */}
      {selectedRail && (
        <div className="space-y-3">
          <button
            className="text-xs text-donkey-muted underline"
            onClick={() => { setSelectedRail(null); setInstruction(null); setError(null); }}
          >
            ← Choose a different method
          </button>

          {busy === 'instruction' && (
            <p className="text-sm text-donkey-muted">{t('pay.preparing')}</p>
          )}

          {/* Lightning / Tando */}
          {instruction && isLightningRail(selectedRail) && instruction.invoice && (
            <div className="space-y-3">
              {selectedRail === 'tando' && (
                <p className="text-xs text-donkey-green">
                  The driver receives M-Pesa; you pay over Lightning.
                </p>
              )}
              <div className="flex justify-center bg-white rounded-lg p-3">
                <QrCodeSvg value={instruction.payLink || `lightning:${instruction.invoice}`} size={220} />
              </div>
              {instruction.amountSats != null && (
                <p className="text-center"><DualPrice sats={instruction.amountSats} size="sm" /></p>
              )}
              <div className="flex gap-2">
                <a
                  className="btn-primary flex-1 text-center text-sm"
                  href={instruction.payLink || `lightning:${instruction.invoice}`}
                >
                  {t('pay.openInWallet')}
                </a>
                <button className="btn-secondary flex-1 text-sm" onClick={handleCopyInvoice}>
                  {copied ? t('profile.copied') : t('pay.copyInvoice')}
                </button>
              </div>

              <div className="p-2 bg-donkey-bg rounded text-[10px] font-mono break-all text-donkey-muted select-all">
                {instruction.invoice}
              </div>

              {/* Outcome unknown: the wallet may have paid. Do NOT offer a
                  retry button here — the way out is to check the wallet and
                  paste the preimage below, which the operator now verifies
                  against every invoice issued for this journey. */}
              {outcomeUnknown && (
                <div className="meta-card border border-donkey-red" role="alert">
                  <p className="font-bold text-donkey-text">{t('pay.unknownTitle')}</p>
                  <p className="text-xs text-donkey-muted mt-1">{t('pay.unknownBody')}</p>
                </div>
              )}

              {/* Connected wallet (NWC). Withheld once the outcome is
                  unknown: re-tapping is how a paid journey gets paid twice. */}
              {nwcConnected && !outcomeUnknown && (
                <button
                  className="btn-primary w-full text-sm"
                  onClick={handlePayWithNwc}
                  disabled={busy === 'nwc' || busy === 'settle'}
                >
                  {busy === 'nwc' ? t('pay.payingWallet') : t('pay.payWithWallet')}
                </button>
              )}
              {!nwcConnected && (
                <div className="space-y-2">
                  <p className="text-xs text-donkey-muted">
                    {t('pay.connectPrompt')}
                  </p>
                  {/* The connection string is a spending capability, and it is
                      kept in localStorage where any script running on this
                      origin could read it. Asking for it on every payment
                      instead would be unusable, so the honest mitigation is to
                      tell the payer to bound the loss in their own wallet —
                      which is the only place a budget can actually be
                      enforced. Said here, at the moment they paste it. */}
                  <p className="text-[11px] text-donkey-muted">
                    {t('pay.nwcBudgetWarning')}
                  </p>
                  <input
                    type="text"
                    className="input-field w-full text-xs font-mono"
                    placeholder="nostr+walletconnect://…"
                    aria-label={t('pay.nwcLabel')}
                    value={nwcUri}
                    onChange={(e) => setNwcUri(e.target.value)}
                  />
                  <button
                    className="btn-secondary w-full text-sm"
                    onClick={handleConnectWallet}
                    disabled={!nwcUri.trim()}
                  >
                    {t('pay.connectWallet')}
                  </button>
                </div>
              )}

              {/* Manual preimage after paying */}
              <div className="space-y-2 border-t border-donkey-border pt-3">
                <p className="text-xs text-donkey-muted">
                  Paid from another wallet? Paste the payment preimage to record it:
                </p>
                <input
                  type="text"
                  className="input-field w-full text-xs font-mono"
                  placeholder={t('pay.preimage')}
                  aria-label={t('pay.preimage')}
                  value={preimage}
                  onChange={(e) => setPreimage(e.target.value)}
                />
                <button
                  className="btn-secondary w-full text-sm"
                  onClick={() => doSettle(selectedRail, { preimage: preimage.trim() })}
                  disabled={busy === 'settle' || !preimage.trim()}
                >
                  {busy === 'settle' ? t('pay.recording') : t('pay.iHavePaid')}
                </button>
              </div>
            </div>
          )}

          {/* M-Pesa */}
          {instruction && selectedRail === 'mpesa' && (
            <div className="space-y-3">
              <div className="meta-card">
                <p className="meta-label">{t('pay.sendMoneyTo')}</p>
                <p className="text-lg font-black text-donkey-text mt-1">{instruction.mpesaNumber}</p>
                <p className="text-sm text-donkey-text mt-1">
                  {formatFiatAmount(instruction.amount ?? 0, instruction.currency)}
                </p>
              </div>
              <ol className="text-xs text-donkey-muted list-decimal list-inside space-y-1">
                <li>{t('pay.mpesaStep1')}</li>
                <li>Enter {instruction.mpesaNumber} and {formatFiatAmount(instruction.amount ?? 0, instruction.currency)}.</li>
                <li>Confirm the transfer to your {providerLabel}.</li>
                <li>{t('pay.mpesaStep3')}</li>
              </ol>
              <p className="text-[11px] text-donkey-muted">
                This is a direct transfer to your {providerLabel}'s phone.
              </p>
              <input
                type="text"
                className="input-field w-full text-sm uppercase"
                placeholder={t('pay.mpesaCode')}
                aria-label={t('pay.mpesaCode')}
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value.toUpperCase())}
              />
              <button
                className="btn-primary w-full text-sm"
                onClick={() => doSettle(selectedRail, { confirmationCode: confirmationCode.trim() })}
                disabled={busy === 'settle' || !confirmationCode.trim()}
              >
                {busy === 'settle' ? t('pay.recording') : t('pay.submitCode')}
              </button>
            </div>
          )}

          {/* Cashu — the token goes to the driver over E2E chat, never here */}
          {instruction && selectedRail === 'cashu' && (
            <div className="space-y-3">
              <div className="meta-card text-center">
                <p className="meta-label">{t('pay.sendEcash')}</p>
                <p className="text-lg font-black text-donkey-text mt-1">
                  {amountSats.toLocaleString()} sats
                </p>
              </div>
              <ol className="text-xs text-donkey-muted list-decimal list-inside space-y-1">
                <li>Create a Cashu token for {amountSats.toLocaleString()} sats in your own wallet.</li>
                <li>Paste it to your {providerLabel} in the chat above — it's end-to-end encrypted.</li>
                <li>{t('pay.cashuStep')}</li>
              </ol>
              {instruction.paymentRequest && (
                <div className="meta-card">
                  <p className="meta-label">{t('pay.theirRequest')}</p>
                  <p className="text-xs font-mono text-donkey-text mt-1 break-all">
                    {instruction.paymentRequest}
                  </p>
                </div>
              )}
              <p className="text-[11px] text-donkey-muted">
                The token is the money — only ever send it in the chat, never
                to the operator.
              </p>
              <button
                className="btn-primary w-full text-sm"
                onClick={() => doSettle('cashu', {})}
                disabled={busy === 'settle'}
              >
                {busy === 'settle' ? t('pay.recording') : t('pay.sentToken')}
              </button>
            </div>
          )}

          {/* Cash */}
          {instruction && selectedRail === 'cash' && (
            <div className="space-y-3">
              <div className="meta-card text-center">
                <p className="meta-label">{t('pay.payCash')}</p>
                <p className="text-lg font-black text-donkey-text mt-1">
                  {formatFiatAmount(instruction.amount ?? 0, instruction.currency)}
                </p>
              </div>
              <p className="text-[11px] text-donkey-muted">
                Hand the cash to your {providerLabel} directly.
              </p>
              <button
                className="btn-primary w-full text-sm"
                onClick={() => doSettle('cash', {})}
                disabled={busy === 'settle'}
              >
                {busy === 'settle' ? t('pay.recording') : t('pay.markPaid')}
              </button>
            </div>
          )}

          {/* Card, on the driver's own reader. The rider taps their card on
              the DRIVER's terminal — the driver is the merchant of record and
              the money goes straight to them. The receipt reference is
              optional and exists only for a dispute; the card number itself
              must never be typed here, and the server refuses it if it is. */}
          {instruction && (selectedRail === 'card' || selectedRail === 'tap-to-pay') && (
            <div className="space-y-3">
              <div className="meta-card text-center">
                <p className="meta-label">{t('pay.payCard')}</p>
                <p className="text-lg font-black text-donkey-text mt-1">
                  {formatFiatAmount(instruction.amount ?? 0, instruction.currency)}
                </p>
                {instruction.terminal && (
                  <p className="text-xs text-donkey-muted mt-1">
                    {t('pay.cardReader', { reader: instruction.terminal })}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-donkey-muted">
                {t('pay.cardDirect', { label: providerLabel.toLowerCase() })}
              </p>
              <input
                className="input-field w-full text-sm"
                inputMode="text"
                autoComplete="off"
                maxLength={24}
                placeholder={t('pay.cardRefPlaceholder')}
                aria-label={t('pay.cardRefPlaceholder')}
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
              />
              <p className="text-[11px] text-donkey-muted">{t('pay.cardNeverAsk')}</p>
              <button
                className="btn-primary w-full text-sm"
                onClick={() => doSettle(selectedRail, {
                  confirmationCode: confirmationCode.trim() || undefined,
                })}
                disabled={busy === 'settle'}
              >
                {busy === 'settle' ? t('pay.recording') : t('pay.markPaid')}
              </button>
            </div>
          )}

          {error && <p className="text-donkey-red text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}
