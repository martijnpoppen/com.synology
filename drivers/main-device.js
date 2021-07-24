const Homey = require('homey');
const { sleep } = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
		this.homey.app.log('[Device] - init =>', this.getName());
        this.homey.app.setDevices(this);

       
        await this.checkCapabilities();
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
}