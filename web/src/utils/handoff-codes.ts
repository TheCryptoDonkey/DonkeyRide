const PREFIX = 'donkeyride:handoff-codes:';

export function generateHandoffCode(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 10000).padStart(4, '0');
}

export function saveHandoffCodes(taskId: string, codes: Record<string, string>): void {
  localStorage.setItem(`${PREFIX}${taskId}`, JSON.stringify(codes));
}

export function loadHandoffCodes(taskId: string): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFIX}${taskId}`) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function clearHandoffCodes(taskId: string): void {
  localStorage.removeItem(`${PREFIX}${taskId}`);
}
