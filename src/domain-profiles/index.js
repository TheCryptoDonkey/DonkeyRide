/**
 * Domain Profiles Module
 *
 * Exports the loader, schema, and built-in profiles.
 */

const { loadProfile, listProfiles, profileExists } = require('./loader');
const { validateProfile, getSchemaTemplate } = require('./schema');

module.exports = {
  loadProfile,
  listProfiles,
  profileExists,
  validateProfile,
  getSchemaTemplate
};
