const mainDriver = require('../main-driver');

module.exports = class driver_DiskStation extends mainDriver {
    deviceType() {
        return 'DiskStation';
    }
}