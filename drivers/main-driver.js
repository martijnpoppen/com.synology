const Homey = require('homey');
const Synology = require('../lib/synology');
const { encrypt } = require('../lib/helpers');

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
                    secure: data.secure || false,
                    ip: data.ipAddress,
                    port: parseInt(data.port) || (data.secure ? 5001 : 5000),
                    user: data.username,
                    passwd: data.password,
                    otp_code: parseInt(data.otp) || null,
                    device_id: null,
                    encrypted_password: true,
                    encrypted_password_fix: true,
                    version: 6,
                    timeout: 3000
                };
                this.homey.app.log(`[Driver] - got config`, this.config);
    
                this._synoClient = await new Synology(this.config);

                if(this.config.otp_code) {
                    this.synoLogin = await this._synoClient._login();
                    this.homey.app.log(`[Driver] - synoLogin`, this.synoLogin);
                    if(this.synoLogin && this.synoLogin.did) {
                        this.config.device_id = this.synoLogin.did;
                        this.config.otp_code = null;
                        
                        this._synoClient = await new Synology(this.config);
                    }
                }
                
                this.synoData = await this._synoClient.getInfo();
                this.homey.app.log(`[Driver] - got config`, this.config);
            } catch (error) {
                this.homey.app.log(`[Driver] - error`, error);
                throw new Error(this.homey.__('pair.error'));
            }
        });

        session.setHandler("list_devices", async () => {
            const deviceType = this.deviceType();
            let results = [];
            let pairedDriverDevices = [];

            this.homey.app.log(`[Driver] - this.synoData`, this.synoData);

            if(this.synoData && this.synoData.hasOwnProperty('error')) {
                throw new Error(this.homey.__('pair.error'));
            } else if(this.synoData && !this.synoData.hasOwnProperty('model')) {
                throw new Error(this.homey.__('pair.error_empty'));
            }

            this.homey.app.getDevices().forEach((device) => {
                const data = device.getData();
                pairedDriverDevices.push(data.id);
            });

            this.homey.app.log(`[Driver] ${this.id} - pairedDriverDevices`, pairedDriverDevices);
            if(!pairedDriverDevices.includes(`${this.id}-${this.synoData.serial}`)) {
                results.push({
                    name: `Synology ${deviceType} - ${this.synoData.model}`,
                    data: {
                        id: `${this.id}-${this.synoData.serial}`,
                    },
                    settings: {
                        ...this.config,
                        passwd: encrypt(this.config.passwd)
                    }
                });
            }

            this.homey.app.log("Found devices - ", results);

            return results;
        });
    }
}