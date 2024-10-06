exports.init = async function (homey) {
    const on = homey.flow.getActionCard('on');
    on.registerRunListener(async (args, state) => {
        await args.device.setCapabilityValue('onoff', true).catch(homey.app.error);
      });
    
    const off = homey.flow.getActionCard('off');
    off.registerRunListener(async (args, state) => {
        await args.device.setCapabilityValue('onoff', false).catch(homey.app.error);
    });

    const action_reboot = homey.flow.getActionCard('action_reboot_flow');
    action_reboot.registerRunListener(async (args, state) => {
        await args.device.onCapability_REBOOT(true).catch(homey.app.error);
    });

    const action_update_data = homey.flow.getActionCard('action_update_data_flow');
    action_update_data.registerRunListener(async (args, state) => {
        await args.device.onCapability_UPDATE_DATA(true).catch(homey.app.error);
    });

    const action_upload_file = homey.flow.getActionCard('action_upload_file_flow');
    action_upload_file.registerRunListener(async (args, state) => {
        await args.device.onCapability_UPLOAD_FILE(args.droptoken).catch(homey.app.error);
    });

    const action_upload_file_hashed = homey.flow.getActionCard('action_upload_file_flow_hashed');
    action_upload_file_hashed.registerRunListener(async (args, state) => {
        await args.device.onCapability_UPLOAD_FILE(args.droptoken, true).catch(homey.app.error);
    });
};