"use strict";

const Homey = require("homey");
let _devices = [];

class App extends Homey.App {
  log() {
    console.log.bind(this, "[log]").apply(this, arguments);
  }

  error() {
    console.error.bind(this, "[error]").apply(this, arguments);
  }

  // -------------------- INIT ----------------------

  async onInit() {
    this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);
  }

  // ---------------------------- GETTERS/SETTERS ----------------------------------
  setDevices(device) {
    _devices.push(device);
  }

  getDevices() {
      return _devices;
  }
}

module.exports = App;
