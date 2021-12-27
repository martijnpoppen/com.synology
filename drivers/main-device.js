const Homey = require('homey');
const Synology = require('../lib/synology');
const FTP = require('../lib/synology/ftp');
const { sleep, hash, decrypt, encrypt, hoursMinutes, splitTime, removeFile, getFileName, getFilePath } = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        try {
            const settings = this.getSettings();

            this.homey.app.log('[Device] - init =>', this.getName());
            this.homey.app.setDevices(this);

            this.homey.app.setDebugLogging(settings.debug);

            if(!settings.mac || settings.mac.length < 8) {
                await this.findMacAddress();
            }

            if(!settings.encrypted_password || !settings.passwd.includes('+')) {
                await this.savePassword({...settings, encrypted_password: true, encrypted_password_fix: true });
            } 

            await this.checkCapabilities();

            await this.setSynoClient();

            this.registerCapabilityListener('onoff', this.onCapability_ON_OFF.bind(this));
            this.registerCapabilityListener('action_reboot', this.onCapability_REBOOT.bind(this));
            this.registerCapabilityListener('action_update_data', this.onCapability_UPDATE_DATA.bind(this));

            await this.checkOnOffState();
            await this.setCapabilityValues();

            if(settings.enable_interval) {
                await this.checkOnOffStateInterval(settings.update_interval);
                await this.setCapabilityValuesInterval(settings.update_interval);
            }

            await this.setAvailable();
        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - OnInit Error`, error);
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.log(`[Device] ${this.getName()} - oldSettings`, {...oldSettings, user: 'LOG', passwd: 'LOG'});
        this.homey.app.log(`[Device] ${this.getName()} - newSettings`, {...newSettings, user: 'LOG', passwd: 'LOG'});

        if(this.onPollInterval || this.onOnOffPollInterval) {
            this.clearIntervals();
        }

        if(newSettings.passwd !== oldSettings.passwd) {
            await this.setSynoClient({...newSettings, passwd: encrypt(newSettings.passwd)});
        } else {
            await this.setSynoClient(newSettings);
        }

        if(newSettings.enable_interval) {
            await this.checkOnOffStateInterval(newSettings.update_interval);
            await this.setCapabilityValuesInterval(newSettings.update_interval);
        }

        if(newSettings.passwd !== oldSettings.passwd) {
            this.savePassword(newSettings, 2000);
        }
    }

    async savePassword(settings, delay = 0) {
        this.homey.app.log(`[Device] ${this.getName()} - savePassword - encrypted`);
        
        if(delay > 0) {
            await sleep(delay);
        }

        await this.setSettings({...settings, passwd: encrypt(settings.passwd)});
    }

    async setSynoClient(overrideSettings = null) {
        const settings = overrideSettings ? overrideSettings : this.getSettings();
        this.config = {...settings, passwd: decrypt(settings.passwd)};
        
        await this.homey.app.setDebugLogging(settings.debug);

        this.homey.app.log(`[Device] - ${this.getName()} => setSynoClient Got config`, {...this.config, user: 'LOG', passwd: 'LOG'});

        this._synoClient = await new Synology(this.config);
        this._ftp = await new FTP({...this.config, port: this.config.sftp_port, path_prefix: '/home/homey-synology/'});
    }

    async checkCapabilities() {
        const driverManifest = this.driver.manifest;
        const driverCapabilities = driverManifest.capabilities;
        
        const deviceCapabilities = this.getCapabilities();

        this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);
        this.homey.app.log(`[Device] ${this.getName()} - Driver capabilities =>`, driverCapabilities);
        
        if(deviceCapabilities.length !== driverCapabilities.length) {      
            await this.updateCapabilities(driverCapabilities, deviceCapabilities);
        }

        return deviceCapabilities;
    }

    async updateCapabilities(driverCapabilities, deviceCapabilities) {
        this.homey.app.log(`[Device] ${this.getName()} - Add new capabilities =>`, driverCapabilities);
        try {
            deviceCapabilities.forEach(c => {
                this.removeCapability(c);
            });
            await sleep(2000);
            driverCapabilities.forEach(c => {
                this.addCapability(c);
            });
            await sleep(2000);
        } catch (error) {
            this.homey.app.log(error)
        }
    }

    async findMacAddress() {
        try {
            const discoveryStrategy = this.homey.discovery.getStrategy("diskstation_discovery");

            // Use the discovery results that were already found
            const initialDiscoveryResults = discoveryStrategy.getDiscoveryResults();
            for (const discoveryResult of Object.values(initialDiscoveryResults)) {
                this.homey.app.log(`[Device] ${this.getName()} - findMacAddress =>`, discoveryResult);

                if(discoveryResult.txt && discoveryResult.txt.vendor === 'Synology') {
                    const mac = discoveryResult.txt.mac_address.split('|');
                    const settings = this.getSettings();

                    await this.setSettings({...settings, mac: mac[0]});

                    this.homey.app.log(`[Device] ${this.getName()} - findMacAddress - address =>`, mac);
                }
            }
        } catch (error) {
            this.homey.app.log(error)
        }
    }

    async onCapability_ON_OFF(value) {
        const settings = this.getSettings();

        try {
            if(!value && settings && settings.override_onoff) {
                throw new Error(this.homey.__("diskstation.override_onoff"));
            }

            if(value) {
                this.homey.app.log(`[Device] ${this.getName()} - onoff - wakeUp`);
                
                await this._synoClient.wakeUp();
                await this.setWarning(this.homey.__("diskstation.wol"));
            } else {
                this.homey.app.log(`[Device] ${this.getName()} - onoff - shutdown`);
                
                await this._synoClient.shutdown();

                if(settings.enable_interval) {
                    await this.setUnavailable(this.homey.__("diskstation.shutdown"));
                }
                
                await sleep(6000);
            }

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

    async onCapability_REBOOT(value) {
        try {
           this.homey.app.log(`[Device] ${this.getName()} - onCapability_REBOOT`, value);

           this.setStoreValue('rebooting', true);
           this.setCapabilityValue('action_reboot', false);

           await this._synoClient.shutdown();
           
           this.setUnavailable(this.homey.__("diskstation.reboot"));

           await this.clearIntervals();
           this.checkOnOffStateInterval(60);

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

    async onCapability_UPDATE_DATA(value) {
        try {
           this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPDATE_DATA`, value);

           this.setCapabilityValue('action_update_data', false);

           this.checkOnOffState();
           this.setCapabilityValues();

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

    async onCapability_UPLOAD_FILE(value, hashed = false) {
        try {
           let filePath = null;
           let fileName = null;

           this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPLOAD_FILE`, value);

            if(!!value.localUrl) {
                fileName = hashed ? `${hash()}.jpg` : `${value.id}.jpg`;
                filePath = await getFilePath(value.localUrl, fileName);

                this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPLOAD_FILE - uploading Image`, value.localUrl, value.id);
                
            } else if(typeof value === 'string') {
                fileName = await getFileName(value, hashed);
                filePath = await getFilePath(value, fileName);
            
                this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPLOAD_FILE - uploading File`, value, fileName);
            }
           
            if(!fileName.includes('.')) {
                throw new Error(this.homey.__("diskstation.file_invalid"));
            }

            this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPLOAD_FILE - FTP`, filePath, fileName);
            await this._ftp.upload(filePath, fileName);

            await sleep(200);
            await removeFile(filePath);

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

    async checkOnOffState() {
        try {  
            const powerState = await this._synoClient.getPowerState();

            this.homey.app.log(`[Device] ${this.getName()} - checkOnOffState`, powerState);

            if(powerState && powerState.status === 200) {
                await this.setCapabilityValue('onoff', true);
                await this.unsetWarning();
            } else {
                await this.setCapabilityValue('onoff', false);
            }

            await this.checkRebootState();
        } catch (e) {
            this.homey.app.log(`[Device] ${this.getName()} - checkOnOffState - error`, e);

            if(e && (e.error && e.error === 498)) {
                await this.setCapabilityValue('onoff', true);
                await this.unsetWarning();
            } else {
                await this.setCapabilityValue('onoff', false);
            }

            await this.checkRebootState();
        }
    }

    async checkRebootState() {
        const settings = this.getSettings();
        const isOn = await this.getCapabilityValue('onoff');
        
        if(isOn && this.getStoreValue('rebooting')) {
            this.homey.app.log(`[Device] ${this.getName()} - checkRebootState - reboot done`);
            this.setStoreValue('rebooting', false);
            
            await this.setAvailable();
            
            await this.clearIntervals();

            if(settings.enable_interval) {
                await this.checkOnOffStateInterval(settings.update_interval);
                await this.setCapabilityValuesInterval(settings.update_interval);
            }

        } else if(!isOn && this.getStoreValue('rebooting')) {
            this.homey.app.log(`[Device] ${this.getName()} - checkRebootState - wakeUp`);
            
            this._synoClient.wakeUp();

        } else if(!this.getStoreValue('rebooting')) {
            await this.setAvailable();
        }
    }

    async checkOnOffStateInterval(update_interval) {
        try {  
            const REFRESH_INTERVAL = 1000 * update_interval;

            this.homey.app.log(`[Device] ${this.getName()} - onOnOffPollInterval =>`, REFRESH_INTERVAL, update_interval);
            this.onOnOffPollInterval = setInterval(this.checkOnOffState.bind(this), REFRESH_INTERVAL);
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async setCapabilityValues() {
        this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues`);

        try { 
            const state = this.getState();
            
            if(!state.onoff) {
                return;
            }

            const deviceInfo = await this._synoClient.getInfo();
            const diskUsageInfo = await this._synoClient.getDiskUsage();
            const systemUsageInfo = await this._synoClient.getSystemUsage();

            if(deviceInfo.error || diskUsageInfo.error || systemUsageInfo.error) {
                throw new Error(deviceInfo.error)
            }

            const {temperature, temperature_warn, uptime, ram} = deviceInfo;
            const { disk_usage } = await this.setDiskUsage(diskUsageInfo);
            const { cpu_load, ram_load } = await this.setLoad(systemUsageInfo);

            this.homey.app.log(`[Device] ${this.getName()} - deviceInfo =>`, deviceInfo);
            this.homey.app.log(`[Device] ${this.getName()} - diskUsageInfo =>`, diskUsageInfo);
            
            await this.setCapabilityValue('alarm_heat', !!temperature_warn);
            await this.setCapabilityValue('measure_temperature', parseInt(temperature));
            await this.setCapabilityValue('measure_uptime', parseFloat(hoursMinutes(uptime)));
            await this.setCapabilityValue('measure_uptime_days', splitTime(uptime, this.homey.__));
            await this.setCapabilityValue('measure_disk_usage', parseInt(disk_usage));
            await this.setCapabilityValue('measure_cpu_usage', parseInt(cpu_load));
            await this.setCapabilityValue('measure_ram_usage', parseInt(ram_load));
        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues - error`, error);
        }
    }

    async setCapabilityValuesInterval(update_interval) {
        try {  
            const REFRESH_INTERVAL = 1000 * update_interval;

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL, update_interval);
            this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async setDiskUsage(data) {
        try {
            const settings = this.getSettings();
            let used = 0;
            let total = 0;

            if (settings.version < 6) {
                for (var i = data.volumes.length; i--;) {
                    used += data.volumes[i].used;
                    total += data.volumes[i].total;
                }
            } else if (settings.version >= 6) {
                for (var i = data.vol_info.length; i--;) {
                    used += data.vol_info[i].used_size;
                    total += data.vol_info[i].total_size;
                }                
            } 


            const usage = {disk_usage: Math.round(used / total * 100)};
            this.homey.app.log(`[Device] ${this.getName()} - setDiskUsage`, used, total, usage);

            return usage;
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async setLoad(data) {
        try {
            const settings = this.getSettings();
            let cpu_load = 0;
            let ram_load = 0;

            if (settings.version >= 6) {
                cpu_load = data.cpu['other_load'] + data.cpu['system_load'] + data.cpu['user_load'];
                ram_load = data.memory.real_usage;
            } else {
                cpu_load = Math.round(data.cpu.user * 100);
            }
    
            const usage = {cpu_load, ram_load};
            this.homey.app.log(`[Device] ${this.getName()} - setLoad`, usage);

            return usage;
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async clearIntervals() {
        this.homey.app.log(`[Device] ${this.getName()} - clearIntervals`);

        await clearInterval(this.onPollInterval);
        await clearInterval(this.onOnOffPollInterval);
    }

    onDeleted() {
        this.clearIntervals();
    }
}