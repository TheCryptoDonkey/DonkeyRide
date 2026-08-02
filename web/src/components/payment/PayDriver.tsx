import { useEffect, useMemo, useState } from 'react';
import { DualPrice } from '../common/DualPrice';
import { QrCodeSvg } from './QrCodeSvg';
import { useDomain } from '../../context/DomainContext';
import {
  getPaymentOptions, getPayInstruction, settleRide,
} from '../../services/api';
import {
  getStoredNwcUri, setStoredNwcUri, payInvoiceViaNwc,
} from '../../services/nwc';
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
  cash: 'Cash',
};

const HONEST_LINE = 'You pay the driver directly. DonkeyRide never touches the money.';

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
  const providerLabel = (profile?.roles.provider || 'driver').toLowerCase();

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
  // M-Pesa
  const [confirmationCode, setConfirmationCode] = useState('');

  useEffect(() => {
    setNwcConnected(!!getStoredNwcUri());
  }, []);

  useEffect(() => {
    let mounted = true;
    getPaymentOptions(task.id)
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch((err) => {
        if (mounted) setOptionsError(err instanceof Error ? err.message : 'Failed to load payment options');
      });
    return () => { mounted = false; };
  }, [task.id]);

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
    setBusy('instruction');
    try {
      const instr = await getPayInstruction(task.id, { rail });
      setInstruction(instr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the payment');
    } finally {
      setBusy(null);
    }
  };

  const doSettle = async (rail: string, proof: { preimage?: string; confirmationCode?: string }) => {
    setBusy('settle');
    setError(null);
    try {
      const res = await settleRide(task.id, { rail, proof });
      // A supplied proof that did not check out (e.g. a mistyped preimage) comes
      // back as 'unverified' — surface it rather than claiming success.
      if (res.settlement?.status === 'unverified') {
        setError(res.settlement.detail || 'That payment proof did not check out. Please try again.');
        return;
      }
      setDeclaredRail(res.settlement?.rail || rail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record the payment');
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
        throw new Error('Paste a nostr+walletconnect:// string');
      }
      setStoredNwcUri(nwcUri.trim());
      setNwcConnected(true);
      setNwcUri('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid connection string');
    }
  };

  const handlePayWithNwc = async () => {
    const uri = getStoredNwcUri();
    if (!uri || !instruction?.invoice || !selectedRail) return;
    setBusy('nwc');
    setError(null);
    try {
      const { preimage: pre } = await payInvoiceViaNwc(uri, instruction.invoice);
      await doSettle(selectedRail, { preimage: pre });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet payment failed');
      setBusy(null);
    }
  };

  const methods: PaymentMethod[] = useMemo(() => options?.methods || [], [options]);

  // ── Confirmed ──
  if (confirmed) {
    return (
      <div className="card text-center space-y-2">
        <p className="text-donkey-green font-bold">Payment confirmed</p>
        <p className="text-xs text-donkey-muted">
          Your {providerLabel} confirmed they received {RAIL_LABELS[settledRail] || settledRail}.
        </p>
        <p className="text-[11px] text-donkey-muted">{HONEST_LINE}</p>
      </div>
    );
  }

  // ── Declared, waiting for the driver ──
  if (declared) {
    return (
      <div className="card text-center space-y-2">
        <p className="text-donkey-green font-bold">Payment recorded</p>
        <p className="text-sm text-donkey-text">
          Waiting for the {providerLabel} to confirm they received it
          {settledRail ? ` (${RAIL_LABELS[settledRail] || settledRail})` : ''}.
        </p>
        {settlement?.verified && (
          <p className="text-xs text-donkey-green">Verified by preimage.</p>
        )}
        <p className="text-[11px] text-donkey-muted">{HONEST_LINE}</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <p className="section-title">Pay your {providerLabel}</p>
        <div className="mt-1"><DualPrice sats={amountSats} size="md" /></div>
        <p className="text-[11px] text-donkey-muted mt-1">{HONEST_LINE}</p>
      </div>

      {optionsError && <p className="text-donkey-red text-sm">{optionsError}</p>}

      {/* Rail chooser */}
      {!selectedRail && (
        <div className="space-y-2">
          {methods.length === 0 && !optionsError && (
            <p className="text-sm text-donkey-muted">Loading payment options…</p>
          )}
          {methods.map((m) => (
            <button
              key={m.rail}
              className="btn-secondary w-full text-left flex items-center justify-between"
              onClick={() => selectRail(m.rail)}
            >
              <span className="font-bold">{RAIL_LABELS[m.rail] || m.rail}</span>
              <span className="text-xs text-donkey-muted">Pay direct</span>
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
            <p className="text-sm text-donkey-muted">Preparing payment…</p>
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
                  Open in wallet
                </a>
                <button className="btn-secondary flex-1 text-sm" onClick={handleCopyInvoice}>
                  {copied ? 'Copied ✓' : 'Copy invoice'}
                </button>
              </div>

              <div className="p-2 bg-donkey-bg rounded text-[10px] font-mono break-all text-donkey-muted select-all">
                {instruction.invoice}
              </div>

              {/* Connected wallet (NWC) */}
              {nwcConnected ? (
                <button
                  className="btn-primary w-full text-sm"
                  onClick={handlePayWithNwc}
                  disabled={busy === 'nwc' || busy === 'settle'}
                >
                  {busy === 'nwc' ? 'Paying with wallet…' : 'Pay with connected wallet (NWC)'}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-donkey-muted">
                    Or connect a Lightning wallet to pay in one tap:
                  </p>
                  <input
                    type="text"
                    className="input-field w-full text-xs font-mono"
                    placeholder="nostr+walletconnect://…"
                    value={nwcUri}
                    onChange={(e) => setNwcUri(e.target.value)}
                  />
                  <button
                    className="btn-secondary w-full text-sm"
                    onClick={handleConnectWallet}
                    disabled={!nwcUri.trim()}
                  >
                    Connect wallet
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
                  placeholder="preimage (64 hex chars)"
                  value={preimage}
                  onChange={(e) => setPreimage(e.target.value)}
                />
                <button
                  className="btn-secondary w-full text-sm"
                  onClick={() => doSettle(selectedRail, { preimage: preimage.trim() })}
                  disabled={busy === 'settle' || !preimage.trim()}
                >
                  {busy === 'settle' ? 'Recording…' : 'I have paid'}
                </button>
              </div>
            </div>
          )}

          {/* M-Pesa */}
          {instruction && selectedRail === 'mpesa' && (
            <div className="space-y-3">
              <div className="meta-card">
                <p className="meta-label">Send Money to</p>
                <p className="text-lg font-black text-donkey-text mt-1">{instruction.mpesaNumber}</p>
                <p className="text-sm text-donkey-text mt-1">
                  {instruction.amount} {instruction.currency}
                </p>
              </div>
              <ol className="text-xs text-donkey-muted list-decimal list-inside space-y-1">
                <li>Open M-Pesa and choose "Send Money".</li>
                <li>Enter {instruction.mpesaNumber} and {instruction.amount} {instruction.currency}.</li>
                <li>Confirm the transfer to your {providerLabel}.</li>
                <li>Enter the M-Pesa confirmation code below.</li>
              </ol>
              <p className="text-[11px] text-donkey-muted">
                This is a direct transfer to your {providerLabel}'s phone.
              </p>
              <input
                type="text"
                className="input-field w-full text-sm uppercase"
                placeholder="M-Pesa confirmation code"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value.toUpperCase())}
              />
              <button
                className="btn-primary w-full text-sm"
                onClick={() => doSettle(selectedRail, { confirmationCode: confirmationCode.trim() })}
                disabled={busy === 'settle' || !confirmationCode.trim()}
              >
                {busy === 'settle' ? 'Recording…' : 'Submit confirmation code'}
              </button>
            </div>
          )}

          {/* Cash */}
          {instruction && selectedRail === 'cash' && (
            <div className="space-y-3">
              <div className="meta-card text-center">
                <p className="meta-label">Pay in cash</p>
                <p className="text-lg font-black text-donkey-text mt-1">
                  {instruction.amount} {instruction.currency}
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
                {busy === 'settle' ? 'Recording…' : 'Mark as paid'}
              </button>
            </div>
          )}

          {error && <p className="text-donkey-red text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}
