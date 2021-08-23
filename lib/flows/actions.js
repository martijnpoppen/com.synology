exports.init = async function (homey) {
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
};