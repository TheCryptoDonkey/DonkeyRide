/**
 * Ride Manager (Backward Compatibility Layer)
 *
 * Re-exports TaskManager as RideManager with the original RideStatus constants.
 * All new code should use TaskManager from src/task-manager.js directly.
 *
 * This module ensures existing code that imports from ride-manager.js continues
 * to work without modification.
 */

const { TaskManager } = require('./task-manager');

// Original RideStatus constants — preserved for backward compatibility
const RideStatus = {
  REQUESTED: 'requested',
  MATCHED: 'matched',
  DRIVER_EN_ROUTE: 'en_route',
  DRIVER_ARRIVED: 'arrived',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * RideManager is a TaskManager pre-configured with the ridesharing domain profile.
 * All original methods (createRide, acceptRide, etc.) are available as aliases.
 */
class RideManager extends TaskManager {
  constructor() {
    super('ridesharing');
    // Expose the underlying maps with their original names for backward compat
    this.rides = this.tasks;
    this.riderRides = this.requesterTasks;
    this.driverRides = this.providerTasks;
  }
}

module.exports = {
  RideManager,
  RideStatus,
  TaskManager
};
