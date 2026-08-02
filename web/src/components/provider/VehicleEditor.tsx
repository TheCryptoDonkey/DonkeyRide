import { useState } from 'react';
import { loadVehicle, saveVehicle, describeVehicle, type Vehicle } from '../../utils/vehicle';
import { showToast } from '../common/Toast';
import { useDomain } from '../../context/DomainContext';

/**
 * The driver's car — stays on this device and is shared only with a
 * matched requester (so they can spot the vehicle at the kerb).
 */
export function VehicleEditor() {
  const { profile } = useDomain();
  const requesterLabel = (profile?.roles.requester || 'requester').toLowerCase();
  const [vehicle, setVehicle] = useState<Vehicle>(loadVehicle() || {});

  const set = (key: keyof Vehicle) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVehicle({ ...vehicle, [key]: e.target.value });

  const handleSave = () => {
    saveVehicle(vehicle);
    const saved = loadVehicle();
    setVehicle(saved || {});
    showToast(saved ? `Vehicle saved: ${describeVehicle(saved)}` : 'Vehicle cleared');
  };

  const inputClass =
    'w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-donkey-text text-sm';

  return (
    <div className="card space-y-3">
      <div>
        <p className="font-bold text-donkey-text">Your vehicle</p>
        <p className="text-xs text-donkey-muted mt-1">
          Shown only to a matched {requesterLabel} so they can spot your
          car. Stays on this device until then.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputClass} placeholder="Colour" value={vehicle.colour || ''} onChange={set('colour')} />
        <input className={inputClass} placeholder="Make (e.g. Toyota)" value={vehicle.make || ''} onChange={set('make')} />
        <input className={inputClass} placeholder="Model (e.g. Prius)" value={vehicle.model || ''} onChange={set('model')} />
        <input className={inputClass} placeholder="Registration" value={vehicle.registration || ''} onChange={set('registration')} />
      </div>
      <button className="btn-secondary w-full" onClick={handleSave}>
        Save vehicle
      </button>
    </div>
  );
}
