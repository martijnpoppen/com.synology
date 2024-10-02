exports.init = async function (homey) {
    // Existing action registrations
    const action_reboot = homey.flow.getActionCard('action_reboot_flow');
    action_reboot.registerRunListener(async (args, state) => {
        await args.device.onCapability_REBOOT(true);
    });

    const action_update_data = homey.flow.getActionCard('action_update_data_flow');
    action_update_data.registerRunListener(async (args, state) => {
        await args.device.onCapability_UPDATE_DATA(true);
    });

    const action_upload_file = homey.flow.getActionCard('action_upload_file_flow');
    action_upload_file.registerRunListener(async (args, state) => {
        await args.device.onCapability_UPLOAD_FILE(args.droptoken);
    });

    const action_upload_file_hashed = homey.flow.getActionCard('action_upload_file_flow_hashed');
    action_upload_file_hashed.registerRunListener(async (args, state) => {
        await args.device.onCapability_UPLOAD_FILE(args.droptoken, true);
    });

    // **Registering New Flow Cards**

    // **Conditions**
    const condition_on = homey.flow.getConditionCard('on');
    condition_on.registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('onoff');
    });

    const condition_off = homey.flow.getConditionCard('off');
    condition_off.registerRunListener(async (args, state) => {
        const isOn = await args.device.getCapabilityValue('onoff');
        return !isOn;
    });

    // **Actions**
    const action_on = homey.flow.getActionCard('on');
    action_on.registerRunListener(async (args, state) => {
        try {
            await args.device.onCapability_ON_OFF(true);
            return Promise.resolve(true);
        } catch (error) {
            homey.app.error(error);
            return Promise.reject(error);
        }
    });

    const action_off = homey.flow.getActionCard('off');
    action_off.registerRunListener(async (args, state) => {
        try {
            await args.device.onCapability_ON_OFF(false);
            return Promise.resolve(true);
        } catch (error) {
            homey.app.error(error);
            return Promise.reject(error);
        }
    });

    const action_toggle = homey.flow.getActionCard('toggle');
    action_toggle.registerRunListener(async (args, state) => {
        try {
            const currentState = await device.getCapabilityValue('onoff');
            await args.device.onCapability_ON_OFF(!currentState);
            return Promise.resolve(true);
        } catch (error) {
            homey.app.error(error);
            return Promise.reject(error);
        }
    });

};
