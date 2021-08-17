"use strict";

const Homey = require("homey");
const flowActions = require('./lib/flows/actions');
const { log } = require("./logger.js");

let _devices = [];

class App extends Homey.App {
  log() {
    console.log.bind(this, "[log]").apply(this, arguments);

    if(this.debugLogs) {
        return log.info.apply(log, arguments)
    }
  }

  error() {
    console.error.bind(this, "[error]").apply(this, arguments);

    if(this.debugLogs) {
        return log.info.apply(log, arguments)
    }
  }

  // -------------------- INIT ----------------------

  async onInit() {
    this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);
    this.debugLogs = false;

    await flowActions.init(this.homey);
  }

  // ---------------------------- GETTERS/SETTERS ----------------------------------
  setDevices(device) {
    _devices.push(device);
  }

  getDevices() {
      return _devices;
  }

  setDebugLogging(debug) {
    this.debugLogs = debug;
  }
}

module.exports = App;
