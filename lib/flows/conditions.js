exports.init = async function (homey) {
    homey.flow.getConditionCard('on').registerRunListener((args, state) => {
        return args.device.getCapabilityValue('onoff');
    });
};
