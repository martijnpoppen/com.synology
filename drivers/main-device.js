const Homey = require('homey');
const Synology = require('../lib/synology');
const { sleep } = require('../lib/helpers');

let _synoClient = undefined;

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        const settings = this.getSettings();

		this.homey.app.log('[Device] - init =>', this.getName());
        this.homey.app.setDevices(this);

        if(!settings.mac || settings.mac.length < 8) {
            await this.findMacAddress();
        }

        await this.checkCapabilities();

        await this.setSynoClient();

        this.registerCapabilityListener('onoff', this.onCapability_ON_OFF.bind(this));

        await this.checkOnOffStateInterval();
        await this.setCapabilityValuesInterval();

        await this.setAvailable();
  }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.log(`[Device] ${this.getName()} - oldSettings`, oldSettings);
        this.homey.app.log(`[Device] ${this.getName()} - newSettings`, newSettings);

        if( this.onPollInterval ) {
            clearInterval(this.onPollInterval);
        }

        await this.setSynoClient(newSettings);
        await this.checkCapabilities();
        await this.setCapabilityValuesInterval();
      }

    async setSynoClient(overrideSettings = null) {
        const settings = overrideSettings ? overrideSettings : this.getSettings();
        this.homey.app.log(`[Device] - ${this.getName()} => setSynoClient Got settings`, settings);

        this.config = {
            ...settings
        };
        this.homey.app.log(`[Device] - ${this.getName()} => setSynoClient Got config`, this.config);

        _synoClient = await new Synology(this.config);
    }

    async checkCapabilities() {
        const driverManifest = this.driver.manifest;
        const driverCapabilities = driverManifest.capabilities;
        
        const deviceCapabilities = this.getCapabilities();

        this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);
        
        if(driverCapabilities.length > deviceCapabilities.length) {      
            await this.updateCapabilities(driverCapabilities);
        }

        return deviceCapabilities;
    }

    async updateCapabilities(driverCapabilities) {
        this.homey.app.log(`[Device] ${this.getName()} - Add new capabilities =>`, driverCapabilities);
        try {
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
        try {
            if(value) {
                this.homey.app.log(`[Device] ${this.getName()} - onoff - wakeUp`);
                _synoClient.wakeUp();

                await this.setWarning(this.homey.__("diskstation.wol"));
            } else {
                this.homey.app.log(`[Device] ${this.getName()} - onoff - shutdown`);
                _synoClient.shutdown();
            }

            return Promise.resolve(true);
        } catch (e) {
            Homey.app.error(e);
            return Promise.reject(e);
        }
    }

    async checkOnOffState() {
        try {  
            const powerState = await _synoClient.getPowerState();

            this.homey.app.log(`[Device] ${this.getName()} - checkOnOffState`, powerState);

            if(powerState && powerState.status === 200) {
                await this.setCapabilityValue('onoff', true);
                await this.unsetWarning();
            } else {
                await this.setCapabilityValue('onoff', false);
            }
        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - checkOnOffState`, error);
            await this.setCapabilityValue('onoff', false);
        }
    }

    async checkOnOffStateInterval() {
        try {  
            const REFRESH_INTERVAL = 1000 * (0.5 * 60);

            this.homey.app.log(`[Device] ${this.getName()} - onOnOffPollInterval =>`, REFRESH_INTERVAL);
            this.onOnOffPollInterval = setInterval(this.checkOnOffState.bind(this), REFRESH_INTERVAL);

            await this.checkOnOffState();
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

            const deviceInfo = await _synoClient.getInfo();
            const diskUsageInfo = await _synoClient.getDiskUsage();
            const systemUsageInfo = await _synoClient.getSystemUsage();

            if(deviceInfo.error || diskUsageInfo.error || systemUsageInfo.error) {
                throw new Error(deviceInfo.error)
            }

            const {temperature, temperature_warn, uptime, ram} = deviceInfo;
            const { disk_usage } = await this.setDiskUsage(diskUsageInfo);
            const { cpu_load } = await this.setCpuLoad(systemUsageInfo);

            this.homey.app.log(`[Device] ${this.getName()} - deviceInfo =>`, deviceInfo);
            this.homey.app.log(`[Device] ${this.getName()} - diskUsageInfo =>`, diskUsageInfo);
            
            await this.setCapabilityValue('alarm_heat', !!temperature_warn);
            await this.setCapabilityValue('measure_temperature', parseInt(temperature));
            await this.setCapabilityValue('measure_uptime', parseInt(uptime) / 3600);
            await this.setCapabilityValue('measure_disk_usage', parseInt(disk_usage));
            await this.setCapabilityValue('measure_cpu_usage', parseInt(cpu_load));
            
            this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues =>`, this.getCapabilities());
        } catch (error) {
            this.homey.app.log(error);
        }
    }

    async setCapabilityValuesInterval() {
        try {  
            const REFRESH_INTERVAL = 1000 * (2 * 60);

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL);
            this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);

            await this.setCapabilityValues();
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

    async setCpuLoad(data) {
        try {
            const settings = this.getSettings();
            let load = 0;

            if (settings.version >= 6) {
                load = data.cpu['other_load'] + data.cpu['system_load'] + data.cpu['user_load'];
            } else {
                load = Math.round(data.cpu.user * 100);
            }
    
            const usage = {cpu_load: load};
            this.homey.app.log(`[Device] ${this.getName()} - cpu_load`, load);

            return usage;
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }
}