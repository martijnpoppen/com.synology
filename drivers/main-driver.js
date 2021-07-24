const Homey = require('homey');
const Synology = require('../lib/synology');
const { rand, sleep } = require('../lib/helpers');
let _synoClient = undefined;

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    deviceType() {
        return 'other';
    }

    async onPair(session) {
        session.setHandler("login", async (data) => {
            try {
                this.config = {
                    debug: false,
                    mac: null,
                    secure: false,
                    ip: data.ipAddress,
                    port: 5000,
                    user: data.username,
                    passwd: data.password,
                    version: 6,
                    timeout: 3000
                };
                this.homey.app.log(`[Driver] - got config`, this.config);
    
                _synoClient = await new Synology(this.config);
                
                this.synoData = await _synoClient.getInfo();
    
                if(!this.synoData && !this.synoData.model) {
                    throw new Error('No DiskStations found.');
                }
            } catch (error) {
                homey.app.log(error);
            }
           
        });

        session.setHandler("list_devices", async () => {
            const deviceType = this.deviceType();
            const random = rand();
            let results = [];
            let pairedDriverDevices = [];

            this.homey.app.getDevices().forEach((device) => {
                const data = device.getData();
                pairedDriverDevices.push(data.id);
            });

            this.homey.app.log(`[Driver] ${this.id} - pairedDriverDevices`, pairedDriverDevices);
            if(!pairedDriverDevices.includes(`${this.id}-${this.config.account}-${random}`)) {
                results.push({
                    name: `Synology ${deviceType} - ${this.synoData.model}`,
                    data: {
                        id: `${this.id}-${this.synoData.serial}`,
                    },
                    settings: {
                        ...this.config
                    }
                });
            }

            this.homey.app.log("Found devices - ", results);

            return results;
        });
    }
}