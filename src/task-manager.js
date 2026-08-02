/**
 * Task Manager
 *
 * Domain-agnostic lifecycle manager for service coordination tasks.
 * Parameterised by a domain profile that defines states, transitions,
 * role names, and domain-specific behaviour.
 *
 * This generalises the original RideManager to support any two-party
 * service coordination use case (ridesharing, locksmith, delivery, etc.).
 */

const { v4: uuidv4 } = require('uuid');
const { nip19 } = require('nostr-tools');
const { loadProfile } = require('./domain-profiles/loader');

function toLower(input) {
  return typeof input === 'string' ? input.toLowerCase() : null;
}

function resolveIdentity(identity = {}) {
  const pubkey = toLower(identity.pubkey);
  let npub = identity.npub || null;
  if (!npub && pubkey && nip19?.npubEncode) {
    try {
      npub = nip19.npubEncode(pubkey);
    } catch (_error) {
      npub = null;
    }
  }
  return { pubkey, npub };
}

function identityKeys(identity = {}) {
  const keys = [];
  if (identity.pubkey) {
    keys.push(identity.pubkey.toLowerCase());
  }
  if (identity.npub) {
    keys.push(identity.npub.toLowerCase());
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

class TaskManager {
  /**
   * @param {Object|string} [profileOrId] - A domain profile object, profile ID string, or undefined for default
   */
  constructor(profileOrId) {
    let profile;
    if (!profileOrId || typeof profileOrId === 'string') {
      profile = loadProfile(profileOrId || undefined);
    } else {
      profile = profileOrId;
    }

    this.profile = profile;
    this.domainId = profile.id;
    this.states = profile.states.values;
    this.transitions = profile.states.transitions;
    this.terminalStates = profile.states.terminal;
    this.initialState = profile.states.initial;
    this.roles = profile.roles;

    this.tasks = new Map();
    this.requesterTasks = new Map();
    this.providerTasks = new Map();
    this.store = null;
    this.snapshotPublisher = null;
    this._pendingPersists = new Set();
  }

  /**
   * Attach a persistence store (see src/storage/task-store.js).
   * Every mutation is persisted; failures are logged, never thrown,
   * so a storage outage degrades to in-memory operation.
   *
   * @param {Object} store - TaskStore instance
   */
  setStore(store) {
    this.store = store;
  }

  /**
   * Attach a Nostr snapshot publisher. Called on every mutation so the
   * operator's durable state lives on relays and survives a restart with
   * no database. The publisher must be PII-safe and never throw.
   *
   * @param {Function} fn - (task) => void
   */
  setSnapshotPublisher(fn) {
    this.snapshotPublisher = fn;
  }

  _persist(task) {
    if (task && typeof this.snapshotPublisher === 'function') {
      try {
        this.snapshotPublisher(task);
      } catch (error) {
        // never let snapshot publishing break a mutation
      }
    }
    if (!this.store || !task) {
      return;
    }
    const write = this.store
      .saveTask(task, { terminal: this.isTerminal(task.status) })
      .catch((error) => {
        console.error(`[storage] Failed to persist task ${task.id}:`, error.message);
      });
    this._pendingPersists.add(write);
    write.finally(() => this._pendingPersists.delete(write));
  }

  /**
   * Wait for all in-flight persistence writes. Called on graceful shutdown
   * so `docker stop` cannot lose the most recent state transitions.
   */
  async flushPersistence() {
    await Promise.allSettled(Array.from(this._pendingPersists));
  }

  /**
   * Restore a task loaded from the store into memory.
   * Used at startup to survive restarts. No-op if the id already exists.
   *
   * @param {Object} task - Task payload as previously persisted
   */
  hydrateTask(task) {
    if (!task || !task.id || this.tasks.has(task.id)) {
      return;
    }
    this.tasks.set(task.id, task);
    if (!this.isTerminal(task.status)) {
      identityKeys(task.requester || {}).forEach((key) => this.requesterTasks.set(key, task.id));
      const provider = task.provider || task.driver;
      if (provider) {
        identityKeys(provider).forEach((key) => this.providerTasks.set(key, task.id));
      }
    }
  }

  /**
   * Validate that a state transition is allowed.
   *
   * @param {string} from - Current state
   * @param {string} to - Desired next state
   * @throws {Error} If the transition is not allowed
   */
  validateTransition(from, to) {
    const allowed = this.transitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(`Transition from '${from}' to '${to}' is not allowed in domain '${this.domainId}'`);
    }
  }

  /**
   * Check whether a state is terminal (completed or cancelled).
   *
   * @param {string} status - State to check
   * @returns {boolean}
   */
  isTerminal(status) {
    return this.terminalStates.includes(status);
  }

  /**
   * Get the completed state value for this domain.
   *
   * @returns {string}
   */
  getCompletedState() {
    return this.states.COMPLETED;
  }

  /**
   * Get the cancelled state value for this domain.
   *
   * @returns {string}
   */
  getCancelledState() {
    return this.states.CANCELLED;
  }

  /**
   * Create a new task request.
   *
   * @param {Object} requesterIdentity - { pubkey, npub }
   * @param {Object} pickup - { lat, lon } or location-like object
   * @param {Object} destination - { lat, lon } or requirements object
   * @param {number} estimatedFare - Estimated cost in sats
   * @param {Object} [options] - Additional options
   * @returns {Object} The created task
   */
  createTask(requesterIdentity, pickup, destination, estimatedFare, options = {}) {
    const prefix = this.domainId === 'ridesharing' ? 'ride' : 'task';
    const taskId = options.rideId || options.taskId || `${prefix}_${uuidv4().split('-')[0]}`;

    if (this.tasks.has(taskId)) {
      throw new Error(`Task ${taskId} already exists`);
    }

    const requester = resolveIdentity(requesterIdentity);

    const task = {
      id: taskId,
      domain: this.domainId,
      status: this.initialState,
      rider: requester,
      requester,
      driver: null,
      provider: null,
      pickup: {
        lat: pickup.lat,
        lon: pickup.lon
      },
      dropoff: destination ? {
        lat: destination.lat,
        lon: destination.lon
      } : null,
      destination: destination ? {
        lat: destination.lat,
        lon: destination.lon
      } : null,
      currency: options.currency || 'GBP',
      fare: estimatedFare,
      // Unix ms pickup time for pre-booked tasks; null = as soon as possible
      scheduledFor: options.scheduledFor || null,
      timestamps: {
        requested: Date.now(),
        matched: null,
        providerEnRoute: null,
        providerArrived: null,
        started: null,
        completed: null,
        // Backward compatibility aliases
        driverEnRoute: null,
        driverArrived: null
      },
      feedback: {
        [this.roles.requester]: null,
        [this.roles.provider]: null,
        // Backward compatibility
        rider: null,
        driver: null
      },
      history: [
        { status: this.initialState, timestamp: Date.now() }
      ]
    };

    this.tasks.set(taskId, task);
    identityKeys(requester).forEach((key) => this.requesterTasks.set(key, taskId));
    this._persist(task);

    console.log(`\u2705 Task created: ${taskId} [${this.domainId}] (${requester.npub || requester.pubkey || 'unknown'})`);

    return task;
  }

  /**
   * Provider accepts a task.
   *
   * @param {string} taskId - Task identifier
   * @param {string} providerNpub - Provider's npub
   * @param {Object} providerInfo - { name, location, rating, pubkey }
   * @returns {Object|null} The updated task, or null if already matched
   */
  acceptTask(taskId, providerNpub, providerInfo) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== this.initialState) {
      return null;
    }

    const matchedState = this.states.MATCHED;
    this.validateTransition(task.status, matchedState);

    const providerIdentity = resolveIdentity({ npub: providerNpub, pubkey: providerInfo.pubkey });

    const providerData = {
      npub: providerIdentity.npub,
      pubkey: providerIdentity.pubkey,
      name: providerInfo.name || this.roles.provider.charAt(0).toUpperCase() + this.roles.provider.slice(1),
      location: providerInfo.location,
      // Never default a rating into existence — reputation comes from
      // aggregated signed rating events, not from acceptance metadata
      rating: providerInfo.rating ?? null
    };

    task.driver = providerData;
    task.provider = providerData;

    task.status = matchedState;
    task.timestamps.matched = Date.now();
    task.history.push({
      status: matchedState,
      timestamp: Date.now(),
      provider: providerNpub,
      driver: providerNpub
    });

    identityKeys(providerIdentity).forEach((key) => this.providerTasks.set(key, taskId));
    this._persist(task);

    console.log(`\u2705 Task ${taskId} matched with ${this.roles.provider} ${providerIdentity.npub || providerIdentity.pubkey || 'unknown'}`);

    return task;
  }

  /**
   * Provider starts moving towards the requester.
   *
   * @param {string} taskId - Task identifier
   * @returns {Object} The updated task
   */
  startEnRoute(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const enRouteState = this.states.PROVIDER_EN_ROUTE;
    this.validateTransition(task.status, enRouteState);

    task.status = enRouteState;
    task.timestamps.providerEnRoute = Date.now();
    task.timestamps.driverEnRoute = Date.now();
    task.history.push({
      status: enRouteState,
      timestamp: Date.now()
    });

    this._persist(task);
    console.log(`\uD83D\uDE97 ${this.roles.provider} en route for task ${taskId}`);

    return task;
  }

  /**
   * Provider has arrived at the location.
   *
   * @param {string} taskId - Task identifier
   * @returns {Object} The updated task
   */
  arriveAtPickup(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const arrivedState = this.states.PROVIDER_ARRIVED;
    this.validateTransition(task.status, arrivedState);

    task.status = arrivedState;
    task.timestamps.providerArrived = Date.now();
    task.timestamps.driverArrived = Date.now();
    task.history.push({
      status: arrivedState,
      timestamp: Date.now()
    });

    this._persist(task);
    console.log(`\uD83D\uDCCD ${this.roles.provider} arrived for task ${taskId}`);

    return task;
  }

  /**
   * Transition the task to a custom intermediate state.
   * Used for domain-specific states like 'access_method_confirmed' or 'collected'.
   *
   * @param {string} taskId - Task identifier
   * @param {string} newState - The target state value
   * @param {Object} [metadata] - Optional metadata to store on the task
   * @returns {Object} The updated task
   */
  transitionTo(taskId, newState, metadata = {}) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.validateTransition(task.status, newState);

    task.status = newState;
    task.history.push({
      status: newState,
      timestamp: Date.now(),
      ...metadata
    });

    if (metadata) {
      task.metadata = { ...(task.metadata || {}), ...metadata };
    }

    this._persist(task);
    console.log(`\u27A1\uFE0F  Task ${taskId} transitioned to '${newState}'`);

    return task;
  }

  /**
   * Start the active service phase.
   *
   * @param {string} taskId - Task identifier
   * @returns {Object} The updated task
   */
  startTrip(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const activeState = this.states.ACTIVE;
    this.validateTransition(task.status, activeState);

    task.status = activeState;
    task.timestamps.started = Date.now();
    task.history.push({
      status: activeState,
      timestamp: Date.now()
    });

    this._persist(task);
    console.log(`\uD83D\uDE80 Task ${taskId} is now active`);

    return task;
  }

  /**
   * Complete the task.
   *
   * @param {string} taskId - Task identifier
   * @param {Object} [paymentInfo] - Payment details
   * @returns {Object} The updated task
   */
  completeTrip(taskId, paymentInfo = {}) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const completedState = this.getCompletedState();
    this.validateTransition(task.status, completedState);

    task.status = completedState;
    task.timestamps.completed = Date.now();
    task.payment = paymentInfo;
    task.history.push({
      status: completedState,
      timestamp: Date.now()
    });

    // Calculate duration
    if (task.timestamps.started) {
      const duration = task.timestamps.completed - task.timestamps.started;
      task.duration = Math.round(duration / 1000);
    }

    this._persist(task);
    console.log(`\u2705 Task ${taskId} completed${task.duration ? ` (${task.duration}s)` : ''}`);

    // Clean up references after 5 minutes (unref so it never blocks process exit)
    const cleanupTimer = setTimeout(() => {
      identityKeys(task.requester).forEach((key) => this.requesterTasks.delete(key));
      const provider = task.provider || task.driver;
      if (provider) {
        identityKeys(provider).forEach((key) => this.providerTasks.delete(key));
      }
    }, 300000);
    if (typeof cleanupTimer.unref === 'function') {
      cleanupTimer.unref();
    }
    this._scheduleEviction(taskId);

    return task;
  }

  /**
   * Evict a terminal task from memory after a retention window. The task
   * lives on in the persistent store; without eviction the in-memory Map
   * grows forever. Retention is generous so post-ride ratings still work.
   */
  _scheduleEviction(taskId) {
    const retainMs = parseInt(process.env.TERMINAL_TASK_RETAIN_MS || String(6 * 60 * 60 * 1000), 10);
    const evictionTimer = setTimeout(() => {
      this.tasks.delete(taskId);
    }, retainMs);
    if (typeof evictionTimer.unref === 'function') {
      evictionTimer.unref();
    }
  }

  /**
   * Record a rating for a completed task.
   *
   * @param {string} taskId - Task identifier
   * @param {string} role - Role of the rater (e.g. 'rider', 'driver', 'customer', 'locksmith')
   * @param {Object} ratingPayload - Rating data
   * @returns {Object} The updated task
   */
  recordRating(taskId, role, ratingPayload) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.feedback) {
      task.feedback = {};
    }

    if (task.feedback[role]) {
      throw new Error(`Rating already recorded for ${role}`);
    }

    task.feedback[role] = {
      ...ratingPayload,
      timestamp: Date.now()
    };

    this._persist(task);
    return task;
  }

  /**
   * Cancel a task.
   *
   * @param {string} taskId - Task identifier
   * @param {string} cancelledBy - Who cancelled
   * @param {string} reason - Cancellation reason
   * @returns {Object} The updated task
   */
  cancelTask(taskId, cancelledBy, reason) {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (this.isTerminal(task.status)) {
      throw new Error(`Task ${taskId} is already ${task.status}`);
    }

    const cancelledState = this.getCancelledState();
    // Cancellation is always allowed from non-terminal states
    task.status = cancelledState;
    task.cancelledBy = cancelledBy;
    task.cancelReason = reason;
    task.timestamps.cancelled = Date.now();
    task.history.push({
      status: cancelledState,
      timestamp: Date.now(),
      by: cancelledBy,
      reason
    });

    this._persist(task);
    console.log(`\u274C Task ${taskId} cancelled by ${cancelledBy}: ${reason}`);

    // Clean up references
    identityKeys(task.requester).forEach((key) => this.requesterTasks.delete(key));
    const provider = task.provider || task.driver;
    if (provider) {
      identityKeys(provider).forEach((key) => this.providerTasks.delete(key));
    }
    this._scheduleEviction(taskId);

    return task;
  }

  /**
   * Update provider location during a task.
   *
   * @param {string} taskId - Task identifier
   * @param {Object} location - { lat, lon }
   * @param {number|null} [eta] - ETA in seconds
   * @returns {Object|null} The updated task, or null if not found
   */
  updateProviderLocation(taskId, location, eta = null) {
    const task = this.tasks.get(taskId);
    const provider = task?.provider || task?.driver;

    if (!task || !provider) {
      return null;
    }

    provider.location = location;

    if (eta !== null) {
      provider.eta = eta;
    }

    this._persist(task);
    return task;
  }

  // ---- Query methods ----

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  getTaskByRequester(requesterNpub) {
    const taskId = this.requesterTasks.get(toLower(requesterNpub));
    return taskId ? this.tasks.get(taskId) : null;
  }

  getTaskByProvider(providerNpub) {
    const taskId = this.providerTasks.get(toLower(providerNpub));
    return taskId ? this.tasks.get(taskId) : null;
  }

  getActiveTasks() {
    return Array.from(this.tasks.values()).filter(
      task => !this.isTerminal(task.status)
    );
  }

  getStats() {
    const tasks = Array.from(this.tasks.values());
    const stats = { total: tasks.length };

    // Count by each state value, keyed in camelCase (REQUESTED → requested,
    // PROVIDER_EN_ROUTE → providerEnRoute)
    for (const [key, value] of Object.entries(this.states)) {
      const count = tasks.filter(t => t.status === value).length;
      const statKey = key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      stats[statKey] = count;
    }

    return stats;
  }

  // ---- Utility methods ----

  calculateETA(from, to, speedKmh = 30) {
    const distance = this.calculateDistance(from.lat, from.lon, to.lat, to.lon);
    const hours = distance / speedKmh;
    return Math.round(hours * 3600);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  // ---- Backward-compatible aliases ----

  /** @deprecated Use createTask() */
  createRide(riderIdentity, pickup, dropoff, estimatedFare, options = {}) {
    return this.createTask(riderIdentity, pickup, dropoff, estimatedFare, options);
  }

  /** @deprecated Use acceptTask() */
  acceptRide(rideId, driverNpub, driverInfo) {
    return this.acceptTask(rideId, driverNpub, driverInfo);
  }

  /** @deprecated Use cancelTask() */
  cancelRide(rideId, cancelledBy, reason) {
    return this.cancelTask(rideId, cancelledBy, reason);
  }

  /** @deprecated Use updateProviderLocation() */
  updateDriverLocation(rideId, location, eta = null) {
    return this.updateProviderLocation(rideId, location, eta);
  }

  /** @deprecated Use getTask() */
  getRide(rideId) {
    return this.getTask(rideId);
  }

  /** @deprecated Use getTaskByRequester() */
  getRideByRider(riderNpub) {
    return this.getTaskByRequester(riderNpub);
  }

  /** @deprecated Use getTaskByProvider() */
  getRideByDriver(driverNpub) {
    return this.getTaskByProvider(driverNpub);
  }

  /** @deprecated Use getActiveTasks() */
  getActiveRides() {
    return this.getActiveTasks();
  }
}

module.exports = {
  TaskManager
};
