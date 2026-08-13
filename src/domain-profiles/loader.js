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
  'community-lift': () => require('./community-lift'),
  locksmith: () => require('./locksmith'),
  delivery: () => require('./delivery'),
  towing: () => require('./towing'),
  'emergency-trades': () => require('./emergency-trades'),
  'pet-services': () => require('./pet-services'),
  security: () => require('./security'),
  cleaning: () => require('./cleaning'),
  moving: () => require('./moving')
};

/**
 * Load a domain profile by its identifier.
 *
 * Resolution order:
 * 1. Built-in profiles (listed in BUILTIN_PROFILES)
 * 2. Custom profile file at src/domain-profiles/{id}.js
 *
 * The id is strictly validated BEFORE touching the filesystem: this
 * function is reachable from unauthenticated route parameters, and
 * `require()` on an attacker-shaped path executes arbitrary local modules
 * (`..%2f` traversal was demonstrated). Arbitrary-path resolution has been
 * removed for the same reason — custom profiles belong in this directory.
 *
 * @param {string} [domainId] - Domain identifier. Defaults to DOMAIN env var or 'ridesharing'.
 * @returns {Object} Validated domain profile
 * @throws {Error} If profile cannot be found or is invalid
 */
function loadProfile(domainId) {
  const id = (domainId || process.env.DOMAIN || 'ridesharing').toLowerCase().trim();

  if (!/^[a-z0-9_-]+$/.test(id)) {
    throw new Error(
      `Invalid domain profile id. ` +
      `Available built-in profiles: ${Object.keys(BUILTIN_PROFILES).join(', ')}`
    );
  }

  let rawProfile;

  // 1. Try built-in profiles
  if (BUILTIN_PROFILES[id]) {
    rawProfile = BUILTIN_PROFILES[id]();
  }

  // 2. Try loading from the domain-profiles directory (validated id only)
  if (!rawProfile) {
    const candidate = path.resolve(__dirname, `${id}.js`);
    if (path.dirname(candidate) !== __dirname) {
      throw new Error(`Invalid domain profile id '${id}'`);
    }
    try {
      rawProfile = require(candidate);
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
