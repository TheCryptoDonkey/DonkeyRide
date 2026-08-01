// ==========================================
// PAYMENT PROVIDER FACTORY
// Creates payment provider instances based on configuration
// ==========================================

const LNDProvider = require('./lnd');
const BTCPayProvider = require('./btcpay');
const AlbyProvider = require('./alby');
const CoreLightningProvider = require('./core-lightning');
const DemoProvider = require('./demo');
const CashProvider = require('./cash');

/**
 * Factory for creating payment provider instances
 * Supports fallback chains for resilience
 */
class PaymentProviderFactory {
    /**
     * Create a payment provider
     * @param {string} type - Provider type: 'cash'|'demo'|'lnd'|'btcpay'|'alby'|'cln'
     * @param {Object} config - Provider configuration
     * @returns {PaymentProvider} Configured provider instance
     */
    static create(type, config = {}) {
        switch (type.toLowerCase()) {
            case 'demo':
            case 'mock':
            case 'test':
                return new DemoProvider(config);

            case 'cash':
                return new CashProvider(config);

            case 'strike':
            case 'nip47':
            case 'nwc':
            case 'stripe':
                throw new Error(
                    `Payment provider '${type}' is planned but not yet implemented. ` +
                    `Available today: cash, demo, lnd, btcpay, alby, cln.`
                );

            case 'lnd':
            case 'lightning':
                return new LNDProvider(config);

            case 'btcpay':
            case 'btcpayserver':
                console.warn('⚠️  btcpay provider is EXPERIMENTAL: never verified against a real BTCPay instance, and release/forfeit still use the legacy both-stakes key convention.');
                return new BTCPayProvider(config);

            case 'alby':
                console.warn('⚠️  alby provider is EXPERIMENTAL: never verified against the real Alby API, and release/forfeit still use the legacy both-stakes key convention.');
                return new AlbyProvider(config);

            case 'cln':
            case 'core-lightning':
            case 'c-lightning':
                console.warn('⚠️  cln provider is EXPERIMENTAL: never verified against a real Core Lightning node, and release/forfeit still use the legacy both-stakes key convention.');
                return new CoreLightningProvider(config);

            default:
                throw new Error(`Unknown payment provider type: ${type}`);
        }
    }

    /**
     * Create provider with automatic fallbacks
     * Tries primary, then falls back through alternatives
     *
     * @param {string} primary - Primary provider type
     * @param {Array<string>} fallbacks - Ordered array of fallback providers
     * @param {Object} configs - Configuration for each provider {type: config}
     * @returns {PaymentProvider} First working provider
     */
    static async createWithFallbacks(primary, fallbacks = [], configs = {}) {
        const providers = [primary, ...fallbacks];

        for (const type of providers) {
            try {
                const provider = this.create(type, configs[type] || {});

                // Check if provider is healthy
                const healthy = await provider.healthCheck();
                if (healthy) {
                    console.log(`✅ Using payment provider: ${type}`);
                    return provider;
                }

                console.warn(`⚠️ Provider ${type} failed health check, trying next...`);
            } catch (error) {
                console.warn(`⚠️ Failed to initialize ${type}: ${error.message}`);
                continue;
            }
        }

        throw new Error('All payment providers failed to initialize');
    }

    /**
     * Create from environment variables
     * Reads PAYMENT_PROVIDER and provider-specific config from env
     *
     * @returns {PaymentProvider} Configured provider
     */
    static fromEnv() {
        const type = process.env.PAYMENT_PROVIDER || 'demo';

        // Build config from environment
        const configs = {
            demo: {},  // Demo provider needs no config
            cash: {},  // Record-only rail needs no config
            lnd: {
                host: process.env.LND_HOST || 'localhost:10009',
                cert: process.env.LND_CERT_PATH || '~/.lnd/tls.cert',
                macaroon: process.env.LND_MACAROON_PATH || '~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon',
                network: process.env.LND_NETWORK || 'mainnet'
            },
            btcpay: {
                url: process.env.BTCPAY_URL,
                apiKey: process.env.BTCPAY_API_KEY,
                storeId: process.env.BTCPAY_STORE_ID
            },
            alby: {
                apiKey: process.env.ALBY_API_KEY,
                refreshToken: process.env.ALBY_REFRESH_TOKEN
            },
            cln: {
                socket: process.env.CLN_SOCKET || '~/.lightning/bitcoin/lightning-rpc',
                network: process.env.CLN_NETWORK || 'bitcoin'
            }
        };

        // Get fallback chain from env (or empty for standalone rails)
        const fallbacks = process.env.PAYMENT_FALLBACKS
            ? process.env.PAYMENT_FALLBACKS.split(',').map(s => s.trim())
            : (['demo', 'cash'].includes(type) ? [] : ['lnd', 'btcpay', 'alby']);

        return this.createWithFallbacks(type, fallbacks, configs);
    }

    /**
     * Get list of all available provider types
     * @returns {Array<string>} Provider type names
     */
    static getAvailableProviders() {
        return ['cash', 'demo', 'lnd', 'btcpay', 'alby', 'cln'];
    }

    /**
     * Get capabilities of all providers
     * Useful for showing options to users
     *
     * @returns {Object} Map of provider -> capabilities
     */
    static async getAllCapabilities() {
        const capabilities = {};
        const types = this.getAvailableProviders();

        for (const type of types) {
            try {
                const provider = this.create(type, {});
                capabilities[type] = provider.getCapabilities();
            } catch (error) {
                capabilities[type] = { error: error.message };
            }
        }

        return capabilities;
    }

    /**
     * Create resilient stake manager with multiple providers
     * Automatically retries failed operations across providers
     *
     * @param {Array<string>} providers - Ordered list of provider types
     * @param {Object} configs - Configurations for each provider
     * @returns {ResilientStakeManager}
     */
    static createResilient(providers = ['lnd', 'btcpay'], configs = {}) {
        return new ResilientStakeManager(providers, configs, this);
    }
}

/**
 * Resilient Stake Manager
 * Wraps multiple providers and retries on failure
 */
class ResilientStakeManager {
    constructor(providerTypes, configs, factory) {
        this.providerTypes = providerTypes;
        this.configs = configs;
        this.factory = factory;
        this.providers = [];
        this.currentProvider = null;
    }

    /**
     * Initialize all providers
     */
    async initialize() {
        for (const type of this.providerTypes) {
            try {
                const provider = this.factory.create(type, this.configs[type] || {});
                const healthy = await provider.healthCheck();

                if (healthy) {
                    this.providers.push(provider);
                }
            } catch (error) {
                console.warn(`Failed to initialize ${type}: ${error.message}`);
            }
        }

        if (this.providers.length === 0) {
            throw new Error('No payment providers available');
        }

        this.currentProvider = this.providers[0];
        console.log(`✅ Initialized ${this.providers.length} payment providers`);
    }

    /**
     * Execute operation with automatic retry across providers
     */
    async executeWithRetry(operation, ...args) {
        for (const provider of this.providers) {
            try {
                const result = await provider[operation](...args);
                this.currentProvider = provider; // Remember successful provider
                return result;
            } catch (error) {
                console.warn(`Provider ${provider.providerName} failed: ${error.message}`);
                continue;
            }
        }

        throw new Error(`All providers failed to execute: ${operation}`);
    }

    // Proxy methods that use retry logic
    async lockStake(...args) {
        return this.executeWithRetry('lockStake', ...args);
    }

    async releaseStake(...args) {
        return this.executeWithRetry('releaseStake', ...args);
    }

    async forfeitStake(...args) {
        return this.executeWithRetry('forfeitStake', ...args);
    }

    async getStakeStatus(...args) {
        return this.executeWithRetry('getStakeStatus', ...args);
    }

    /**
     * Get status of all providers
     */
    async getProvidersStatus() {
        const status = {};

        for (const provider of this.providers) {
            try {
                const healthy = await provider.healthCheck();
                status[provider.providerName] = {
                    healthy,
                    capabilities: provider.getCapabilities()
                };
            } catch (error) {
                status[provider.providerName] = {
                    healthy: false,
                    error: error.message
                };
            }
        }

        return status;
    }
}

module.exports = {
    PaymentProviderFactory,
    ResilientStakeManager
};
