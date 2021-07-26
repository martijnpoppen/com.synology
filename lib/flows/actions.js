exports.init = async function (homey) {
    const action_reboot = homey.flow.getActionCard('action_reboot_flow');
    action_reboot.registerRunListener(async (args, state) => {
        await RainApi.makeItStopRaining();
        await args.device.onCapability_action_reboot( true );
    });
};