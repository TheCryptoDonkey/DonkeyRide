/**
 * Domain Profile Loader
 *
 * Loads and validates domain profiles by identifier.
 * The DOMAIN environment variable selects which profile to use.
 * Defaults to 'ridesharing' when not set.
 */

const path = require('path');
const { validateProfile } = require('./schema');

// Built-in profiles shipped with the codebase
const BUILTIN_PROFILES = {
  ridesharing: () => require('./ridesharing'),
  locksmith: () => require('./locksmith'),
  delivery: () => require('./delivery')
};

/**
 * Load a domain profile by its identifier.
 *
 * Resolution order:
 * 1. Built-in profiles (ridesharing, locksmith, delivery)
 * 2. Custom profile file at src/domain-profiles/{id}.js
 * 3. Absolute path to a profile module
 *
 * @param {string} [domainId] - Domain identifier or path. Defaults to DOMAIN env var or 'ridesharing'.
 * @returns {Object} Validated domain profile
 * @throws {Error} If profile cannot be found or is invalid
 */
function loadProfile(domainId) {
  const id = (domainId || process.env.DOMAIN || 'ridesharing').toLowerCase().trim();

  let rawProfile;

  // 1. Try built-in profiles
  if (BUILTIN_PROFILES[id]) {
    rawProfile = BUILTIN_PROFILES[id]();
  }

  // 2. Try loading from domain-profiles directory
  if (!rawProfile) {
    try {
      rawProfile = require(path.resolve(__dirname, `${id}.js`));
    } catch (_err) {
      // Not found in built-in directory, try absolute/relative path
    }
  }

  // 3. Try as an absolute or relative path
  if (!rawProfile) {
    try {
      rawProfile = require(path.resolve(id));
    } catch (_err) {
      throw new Error(
        `Domain profile '${id}' not found. ` +
        `Available built-in profiles: ${Object.keys(BUILTIN_PROFILES).join(', ')}`
      );
    }
  }

  // Validate and return with defaults applied
  return validateProfile(rawProfile);
}

/**
 * List all available built-in domain profile identifiers.
 *
 * @returns {string[]} Array of profile IDs
 */
function listProfiles() {
  return Object.keys(BUILTIN_PROFILES);
}

/**
 * Check whether a domain profile identifier is valid and loadable.
 *
 * @param {string} domainId - Domain identifier
 * @returns {boolean} True if the profile can be loaded
 */
function profileExists(domainId) {
  try {
    loadProfile(domainId);
    return true;
  } catch (_err) {
    return false;
  }
}

module.exports = {
  loadProfile,
  listProfiles,
  profileExists
};
