interface RetentionNoticeProps {
  dataRetention: {
    taskData: number;
    locationData: number;
    paymentData: number;
  };
}

/**
 * Data retention policy display.
 * Shows how long the operator retains different categories of data,
 * as defined by the domain profile's `dataRetention` settings.
 */
export function RetentionNotice({ dataRetention }: RetentionNoticeProps) {
  const formatDays = (days: number) => {
    if (days >= 365) return `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}`;
    if (days >= 30) return `${Math.round(days / 30)} month${days >= 60 ? 's' : ''}`;
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  return (
    <div className="card text-xs text-donkey-muted space-y-1">
      <p className="meta-label mb-2">Data retention policy</p>
      <p>Task records: <span className="text-donkey-text">{formatDays(dataRetention.taskData)}</span></p>
      <p>Location data: <span className="text-donkey-text">{formatDays(dataRetention.locationData)}</span></p>
      <p>Payment data: <span className="text-donkey-text">{formatDays(dataRetention.paymentData)}</span></p>
    </div>
  );
}
