import { useEffect, useState } from 'react';
import { getDemand, type DemandCell } from '../../services/api';
import { haversineMetres } from '../../utils/geo';
import { formatDistance } from '../../services/pricing';
import { useT } from '../../i18n';
import type { LatLng } from '../../types/api';

interface DemandPanelProps {
  /** The driver's own position, when there is a fix — nearest first */
  location: LatLng | null;
  taskNoun: string;
  domain?: string;
}

/**
 * Where the work is.
 *
 * A driver deciding where to sit has had nothing to go on but a guess,
 * while the operator has been computing exactly this to price demand. The
 * figures are aggregated to ~5 km cells and never include a cell with one
 * person in it, so this points at a district, never a doorway.
 *
 * Supply is shown next to demand on purpose: "twelve waiting" with thirty
 * idle drivers already there is not somewhere to drive to, and an app that
 * showed only the demand half would be sending people on wild goose
 * chases in the name of engagement.
 */
export function DemandPanel({ location, taskNoun, domain }: DemandPanelProps) {
  const { t } = useT();
  const [cells, setCells] = useState<DemandCell[] | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => getDemand(domain)
      .then(({ cells: next }) => { if (live) setCells(next); })
      .catch(() => { if (live) setCells([]); });
    void load();
    const timer = window.setInterval(load, 60000);
    return () => { live = false; window.clearInterval(timer); };
  }, [domain]);

  if (cells == null) return null;

  if (cells.length === 0) {
    return (
      <p className="text-xs text-donkey-muted text-center">
        {t('demand.quiet', { noun: taskNoun })}
      </p>
    );
  }

  const metresTo = (cell: DemandCell) =>
    haversineMetres(location!, { lat: cell.lat, lng: cell.lon });
  const ranked = location
    ? [...cells].sort((a, b) => metresTo(a) - metresTo(b))
    : cells;

  return (
    <div className="space-y-2">
      <p className="section-title">{t('demand.title')}</p>
      <ul className="space-y-1">
        {ranked.slice(0, 4).map((cell) => {
          const km = location ? metresTo(cell) / 1000 : null;
          // More people than cars is the only case worth driving toward
          const short = cell.waiting > cell.available;
          return (
            <li
              key={cell.geohash}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="text-donkey-text truncate">
                {km != null ? t('demand.away', { dist: formatDistance(km) }) : cell.geohash}
                {cell.multiplier > 1 && (
                  <span className="text-donkey-orange font-semibold">
                    {' · '}{cell.multiplier.toFixed(1)}×
                  </span>
                )}
              </span>
              <span className={short ? 'text-donkey-green font-semibold shrink-0' : 'text-donkey-muted shrink-0'}>
                {t('demand.counts', { waiting: cell.waiting, available: cell.available })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-donkey-muted">{t('demand.note')}</p>
    </div>
  );
}
