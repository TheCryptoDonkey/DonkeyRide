import { describe, it, expect, vi, beforeEach } from 'vitest';
// No global setup file, so auto-cleanup is off: without this each test's
// DOM stays mounted and queries find the PREVIOUS test's output.
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Access needs are Article 9 special-category data — wheelchair, step-free
 * and assistance-dog options are "data concerning health" under Article
 * 4(15), because ticking one discloses a disability.
 *
 * Article 9(1) prohibits processing them; Article 9(2)(a) lifts that on
 * EXPLICIT consent, and consent is only explicit if it is informed. A
 * checkbox with no notice is an affirmative act about something the person
 * was never told. So the notice has to be on screen BEFORE the tick, not in
 * a privacy policy two navigations away.
 */

const ACCESS_OPTIONS = [
  { id: 'wheelchair', label: 'Wheelchair accessible', description: 'Ramp or lift' },
  { id: 'assistance_dog', label: 'Assistance dog', providerPrompt: 'I accept assistance dogs' },
];

const domainState: { profile: unknown } = { profile: null };
vi.mock('../../context/DomainContext', () => ({
  useDomain: () => domainState,
}));

const { AccessNeedsPicker } = await import('./AccessNeedsPicker');

describe('AccessNeedsPicker consent', () => {
  beforeEach(() => {
    cleanup();
    domainState.profile = { accessOptions: ACCESS_OPTIONS, labels: {} };
  });

  it('tells the requester what ticking a box means, before they tick it', () => {
    render(<AccessNeedsPicker value={[]} onChange={() => {}} role="requester" />);

    const notice = screen.getByText(/say something about your health/i);
    expect(notice).toBeTruthy();

    // Informed consent has to name the purpose, the recipient and the
    // retention — otherwise it is consent to nothing in particular.
    const text = notice.textContent || '';
    expect(text).toMatch(/find someone who can meet it/i);   // purpose
    expect(text).toMatch(/only the provider who takes the job/i); // recipient
    expect(text).toMatch(/never published/i);                 // not relayed
    expect(text).toMatch(/deleted when the job ends/i);       // retention
  });

  it('shows it with nothing selected yet — consent precedes the act', () => {
    // The pre-existing follow-up note only appears AFTER a selection. If the
    // consent notice behaved the same way it would arrive too late to be
    // consent at all.
    render(<AccessNeedsPicker value={[]} onChange={() => {}} role="requester" />);

    expect(screen.queryByText(/say something about your health/i)).toBeTruthy();
    expect(screen.queryByText(/Only providers who have said/i)).toBeNull();
  });

  it('does NOT show it to a provider — that is a vehicle policy, not their health', () => {
    render(<AccessNeedsPicker value={[]} onChange={() => {}} role="provider" />);

    expect(screen.queryByText(/say something about your health/i)).toBeNull();
  });

  it('renders nothing at all when the domain declares no access options', () => {
    domainState.profile = { accessOptions: [], labels: {} };
    const { container } = render(
      <AccessNeedsPicker value={[]} onChange={() => {}} role="requester" />,
    );

    expect(container.textContent).toBe('');
  });
});
