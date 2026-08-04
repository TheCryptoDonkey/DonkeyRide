// ==========================================
// RELAY MESH NETWORK
// Seamless ride discovery across multiple relay operators
// ==========================================

const WebSocket = require('ws');
const { SimplePool } = require('nostr-tools');

class RelayMesh {
    constructor(config) {
        this.localRelay = config.localRelay;
        this.location = config.location;
        this.radiusKm = config.radiusKm || 50;
        
        // Track peer relays
        this.peers = new Map();
        this.pool = new SimplePool();
        
        // Local ride cache
        this.rides = new Map();
        this.drivers = new Map();
        
        // Relay health tracking
        this.relayHealth = new Map();
    }

    // ==========================================
    // RELAY DISCOVERY
    // ==========================================
    
    async discoverRelays() {
        console.log('🔍 Discovering nearby relays...');
        
        // Query discovery relays for operator announcements. Defaults to OUR
        // relay rather than a list of public ones: this prototype is run by
        // hand, and a hardcoded public relay is how signed operator state
        // ends up somewhere nobody chose. Override with MESH_DISCOVERY_RELAYS.
        const discoveryRelays = (process.env.MESH_DISCOVERY_RELAYS || 'wss://relay.trotters.cc')
            .split(',').map(r => r.trim()).filter(Boolean);
        
        const filter = {
            kinds: [30400], // Relay announcements
            limit: 100,
            since: Math.floor(Date.now() / 1000) - 86400 // Last 24h
        };
        
        const announcements = await this.pool.list(discoveryRelays, [filter]);
        
        // Filter by location and capabilities
        const nearbyRelays = announcements.filter(event => {
            const locationTag = event.tags.find(t => t[0] === 'location');
            if (!locationTag) return false;
            
            const [lat, lon] = locationTag[1].split(',').map(Number);
            const distance = this.calculateDistance(
                this.location.lat, 
                this.location.lon,
                lat, 
                lon
            );
            
            return distance <= this.radiusKm;
        });
        
        // Add discovered relays as peers
        for (const announcement of nearbyRelays) {
            const urlTag = announcement.tags.find(t => t[0] === 'relay_url');
            const feeTag = announcement.tags.find(t => t[0] === 'fee_percent');
            
            if (urlTag) {
                const fee = parseFloat(feeTag?.[1] || 0.5);
                const featuresTag = announcement.tags.find(t => t[0] === 'features');
                const reputationTag = announcement.tags.find(t => t[0] === 'reputation');
                
                this.addPeer({
                    url: urlTag[1],
                    pubkey: announcement.pubkey,
                    fee: fee,
                    features: featuresTag?.[1]?.split(',') || [],
                    reputation: parseFloat(reputationTag?.[1] || 0),
                    announcement
                });
                
                console.log(`📡 Relay ${urlTag[1]} - Fee: ${fee}%, Features: ${featuresTag?.[1] || 'basic'}`);
            }
        }
        
        console.log(`✅ Found ${this.peers.size} nearby relays`);
        return Array.from(this.peers.values());
    }

    // ==========================================
    // PEER MANAGEMENT
    // ==========================================
    
    addPeer(peerInfo) {
        const peer = {
            ...peerInfo,
            connected: false,
            lastSeen: Date.now(),
            rideCount: 0,
            ws: null
        };
        
        this.peers.set(peerInfo.url, peer);
        this.connectToPeer(peer);
    }
    
    async connectToPeer(peer) {
        try {
            const ws = new WebSocket(peer.url);
            
            ws.on('open', () => {
                console.log(`✅ Connected to peer: ${peer.url}`);
                peer.connected = true;
                peer.ws = ws;
                
                // Subscribe to ride events from this peer
                this.subscribeToRides(peer);
            });
            
            ws.on('message', (data) => {
                this.handlePeerMessage(peer, JSON.parse(data));
            });
            
            ws.on('close', () => {
                peer.connected = false;
                console.log(`❌ Disconnected from peer: ${peer.url}`);
                
                // Retry connection after 30 seconds
                setTimeout(() => this.connectToPeer(peer), 30000);
            });
            
            ws.on('error', (error) => {
                console.error(`Error with peer ${peer.url}:`, error.message);
            });
            
        } catch (error) {
            console.error(`Failed to connect to ${peer.url}:`, error.message);
        }
    }
    
    subscribeToRides(peer) {
        // Subscribe to ride events from this peer
        const subscription = [
            "REQ",
            "rides",
            {
                kinds: [30500, 30501, 30511, 30521], // Ride events
                since: Math.floor(Date.now() / 1000)
            }
        ];
        
        peer.ws.send(JSON.stringify(subscription));
    }

    // ==========================================
    // MESSAGE HANDLING
    // ==========================================
    
    handlePeerMessage(peer, message) {
        if (message[0] === 'EVENT') {
            const event = message[2];
            
            switch(event.kind) {
                case 30500: // Ride request
                    this.handleRideRequest(event, peer);
                    break;
                case 30501: // Ride acceptance
                    this.handleRideAcceptance(event, peer);
                    break;
                case 30511: // Ride completion
                    this.handleRideCompletion(event, peer);
                    break;
                case 30521: // Cancellation
                    this.handleCancellation(event, peer);
                    break;
            }
        }
    }
    
    handleRideRequest(event, sourcePeer) {
        const rideId = event.id;
        
        // Check if we've seen this ride before
        if (this.rides.has(rideId)) {
            return; // Prevent loops
        }
        
        // Extract ride details
        const fromTag = event.tags.find(t => t[0] === 'from');
        const toTag = event.tags.find(t => t[0] === 'to');
        const priceTag = event.tags.find(t => t[0] === 'price');
        
        // Store ride with source relay info
        this.rides.set(rideId, {
            event,
            sourceRelay: sourcePeer.url,
            sourceFee: sourcePeer.fee,
            timestamp: Date.now(),
            from: fromTag?.[2],
            to: toTag?.[2],
            price: parseInt(priceTag?.[1] || 0)
        });
        
        // Broadcast to local drivers
        this.broadcastToLocalDrivers(event, sourcePeer);
        
        // Relay to other peers (gossip protocol)
        this.gossipToOtherPeers(event, sourcePeer);
        
        console.log(`📍 New ride: ${fromTag?.[2]} → ${toTag?.[2]} (via ${sourcePeer.url})`);
    }

    // ==========================================
    // BROADCASTING & GOSSIP
    // ==========================================
    
    broadcastToLocalDrivers(rideEvent, sourceRelay) {
        // Add relay information to the event
        const enrichedEvent = {
            ...rideEvent,
            tags: [
                ...rideEvent.tags,
                ['source_relay', sourceRelay.url],
                ['relay_fee', sourceRelay.fee.toString()],
                ['total_fee', (sourceRelay.fee + this.localRelay.fee).toString()]
            ]
        };
        
        // Broadcast to all connected local drivers
        this.drivers.forEach(driver => {
            if (driver.connected) {
                driver.ws.send(JSON.stringify([
                    'EVENT',
                    'ride-available',
                    enrichedEvent
                ]));
            }
        });
    }
    
    gossipToOtherPeers(event, sourcePeer) {
        // Relay to other peers (except source)
        this.peers.forEach(peer => {
            if (peer.url !== sourcePeer.url && peer.connected) {
                // Add gossip tracking to prevent loops
                const gossipEvent = {
                    ...event,
                    tags: [
                        ...event.tags,
                        ['gossiped_from', this.localRelay.url],
                        ['original_relay', sourcePeer.url]
                    ]
                };
                
                peer.ws.send(JSON.stringify([
                    'EVENT',
                    'gossip',
                    gossipEvent
                ]));
            }
        });
    }

    // ==========================================
    // CROSS-RELAY COORDINATION
    // ==========================================
    
    async coordinateCrossRelayRide(rideId, driverId, driverRelay) {
        const ride = this.rides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        // If driver uses different relay than rider
        if (driverRelay !== ride.sourceRelay) {
            console.log(`🔀 Cross-relay coordination needed`);
            
            // Create coordination event
            const coordinationEvent = {
                kind: 30505,
                pubkey: this.localRelay.pubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['e', rideId],
                    ['p', driverId],
                    ['rider_relay', ride.sourceRelay],
                    ['driver_relay', driverRelay],
                    ['coordination_type', 'stake_bridge'],
                    ['total_fee', (ride.sourceFee + this.localRelay.fee).toString()]
                ],
                content: 'Cross-relay ride coordination'
            };
            
            // Sign and broadcast
            coordinationEvent.id = await this.getEventHash(coordinationEvent);
            coordinationEvent.sig = await this.signEvent(coordinationEvent);
            
            // Send to both relays
            await this.sendToRelay(ride.sourceRelay, coordinationEvent);
            await this.sendToRelay(driverRelay, coordinationEvent);
            
            return coordinationEvent;
        }
        
        return null;
    }

    // ==========================================
    // RELAY SELECTION & LOAD BALANCING
    // ==========================================
    
    selectBestRelay(riders, drivers) {
        // Score relays based on multiple factors
        const scores = Array.from(this.peers.values()).map(relay => {
            const score = {
                relay: relay.url,
                fee: relay.fee,
                latency: this.relayHealth.get(relay.url)?.latency || 999,
                uptime: this.relayHealth.get(relay.url)?.uptime || 0,
                load: relay.rideCount,
                // Combined score (lower is better)
                total: (relay.fee * 100) + 
                       (this.relayHealth.get(relay.url)?.latency || 999) / 10 +
                       (100 - (this.relayHealth.get(relay.url)?.uptime || 0)) +
                       (relay.rideCount / 10)
            };
            return score;
        });
        
        // Sort by total score
        scores.sort((a, b) => a.total - b.total);
        
        return scores[0]?.relay || this.localRelay.url;
    }

    // ==========================================
    // HEALTH MONITORING
    // ==========================================
    
    async monitorRelayHealth() {
        setInterval(async () => {
            for (const [url, peer] of this.peers) {
                const startTime = Date.now();
                
                try {
                    // Ping relay
                    await this.pingRelay(peer);
                    const latency = Date.now() - startTime;
                    
                    // Update health metrics
                    const health = this.relayHealth.get(url) || {
                        checks: 0,
                        failures: 0,
                        totalLatency: 0
                    };
                    
                    health.checks++;
                    health.totalLatency += latency;
                    health.latency = health.totalLatency / health.checks;
                    health.uptime = ((health.checks - health.failures) / health.checks) * 100;
                    health.lastCheck = Date.now();
                    
                    this.relayHealth.set(url, health);
                    
                } catch (error) {
                    // Record failure
                    const health = this.relayHealth.get(url) || {
                        checks: 0,
                        failures: 0
                    };
                    health.checks++;
                    health.failures++;
                    health.uptime = ((health.checks - health.failures) / health.checks) * 100;
                    
                    this.relayHealth.set(url, health);
                }
            }
        }, 30000); // Check every 30 seconds
    }
    
    async pingRelay(peer) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
            
            const pingId = Math.random().toString(36);
            peer.ws.send(JSON.stringify(['PING', pingId]));
            
            const handler = (data) => {
                const message = JSON.parse(data);
                if (message[0] === 'PONG' && message[1] === pingId) {
                    clearTimeout(timeout);
                    peer.ws.removeListener('message', handler);
                    resolve();
                }
            };
            
            peer.ws.on('message', handler);
        });
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    async getEventHash(event) {
        // Implementation would use nostr-tools
        return 'hash_' + Math.random().toString(36);
    }
    
    async signEvent(event) {
        // Implementation would use nostr-tools
        return 'sig_' + Math.random().toString(36);
    }
    
    async sendToRelay(relayUrl, event) {
        const peer = this.peers.get(relayUrl);
        if (peer && peer.connected) {
            peer.ws.send(JSON.stringify(['EVENT', event]));
        }
    }
}

// ==========================================
// DRIVER CLIENT AGGREGATOR
// ==========================================

class DriverAggregator {
    constructor() {
        this.relays = [];
        this.rides = new Map();
        this.subscriptions = new Map();
    }
    
    async connect(location) {
        // Discover all available relays
        const mesh = new RelayMesh({
            localRelay: { url: 'client', fee: 0 },
            location: location,
            radiusKm: 50
        });
        
        const relays = await mesh.discoverRelays();
        
        // Connect to all discovered relays
        for (const relay of relays) {
            this.connectToRelay(relay);
        }
        
        console.log(`📱 Driver connected to ${relays.length} relays`);
    }
    
    connectToRelay(relay) {
        const ws = new WebSocket(relay.url);
        
        ws.on('open', () => {
            // Subscribe to all rides
            ws.send(JSON.stringify([
                'REQ',
                'all-rides',
                { kinds: [30500], since: Math.floor(Date.now() / 1000) }
            ]));
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data);
            if (message[0] === 'EVENT') {
                this.handleRide(message[2], relay);
            }
        });
        
        this.relays.push({ ...relay, ws });
    }
    
    handleRide(ride, sourceRelay) {
        // Deduplicate rides from multiple relays
        if (!this.rides.has(ride.id)) {
            this.rides.set(ride.id, {
                ...ride,
                relays: [sourceRelay],
                bestRelay: sourceRelay // Track relay with lowest fee
            });
        } else {
            // Update if we found a relay with lower fee
            const existing = this.rides.get(ride.id);
            existing.relays.push(sourceRelay);
            
            if (sourceRelay.fee < existing.bestRelay.fee) {
                existing.bestRelay = sourceRelay;
            }
        }
        
        // Display to driver
        this.displayRide(ride);
    }
    
    displayRide(ride) {
        const fromTag = ride.tags.find(t => t[0] === 'from');
        const toTag = ride.tags.find(t => t[0] === 'to');
        const priceTag = ride.tags.find(t => t[0] === 'price');
        
        console.log(`
        🚗 New Ride Request:
        From: ${fromTag?.[2]}
        To: ${toTag?.[2]}
        Fare: ${priceTag?.[1]} sats
        Available on ${this.rides.get(ride.id).relays.length} relays
        Best relay fee: ${this.rides.get(ride.id).bestRelay.fee}%
        `);
    }
    
    async acceptRide(rideId) {
        const ride = this.rides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        // Use relay with lowest fee
        const relay = ride.bestRelay;
        
        console.log(`✅ Accepting ride via ${relay.url} (${relay.fee}% fee)`);
        
        // Send acceptance to the chosen relay
        const acceptance = {
            kind: 30501,
            tags: [
                ['e', rideId],
                ['relay', relay.url]
            ]
        };
        
        relay.ws.send(JSON.stringify(['EVENT', acceptance]));
    }
}

// ==========================================
// USAGE EXAMPLE
// ==========================================

async function runRelayMesh() {
    // Initialize relay mesh for NYC area
    const mesh = new RelayMesh({
        localRelay: {
            url: 'wss://nyc1.donkeyride.com',
            pubkey: 'npub1...',
            fee: 0.5
        },
        location: { lat: 40.7128, lon: -74.0060 },
        radiusKm: 50
    });
    
    // Discover and connect to peer relays
    await mesh.discoverRelays();
    
    // Start health monitoring
    mesh.monitorRelayHealth();
    
    console.log('🌐 Relay mesh network active');
    console.log(`Connected to ${mesh.peers.size} peer relays`);
}

// Driver perspective
async function driverConnect() {
    const aggregator = new DriverAggregator();
    
    // Connect to all available relays in the area
    await aggregator.connect({
        lat: 40.7128,
        lon: -74.0060
    });
    
    // Driver now sees ALL rides from ALL relays
    // Can accept through relay with lowest fee
}

module.exports = { RelayMesh, DriverAggregator };