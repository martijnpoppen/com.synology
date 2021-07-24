/**
 * synology.js functions for homebridge
 * 12.03.2016 by stfnhmplr
 */

 var request = require('request');
 var got = require('got');
 var wol = require('wake_on_lan');
 
 
 class Synology  {
    constructor(params) {
        this.ip = params.ip;
        this.mac = params.mac;
        this.secure = params.secure || false;
        this.port = params.port || (this.secure ? 5001 : 5000);
        this.timeout = parseInt(params.timeout) || 5000; //request timeout
        this.version = parseInt(params.version) ||  6;

        this._isDebugMode = params.debug || false;;
    
        this.user = params.user;
        this.passwd = params.passwd;
        this.auth = {
            sid: '', //session id
            time: '', //unix time
            timeout: 15 * 60 //in sec
        };
    
        this.url = 'http' + (this.secure ? 's' : '') + '://' + this.ip + ':' + this.port;
    };



    /**
     * Utility function which returns the current time in the format hh:mm:ss.us.
     * 
     * @private
     * 
     * @returns {string} Current time in the format hh:mm:ss.us.
     */
    _getTime() {

        var now = new Date();

        var paddingHead = function(num, size) {
            var str = num + "";

            while (str.length < size) {
                str = "0" + str;
            }

            return str;
        };

        var paddingTail = function(num, size) {
            var str = num + "";

            while (str.length < size) {
                str = str + "0";
            }

            return str;
        };

        return "" + paddingHead(now.getHours(), 2) + ":" +
            paddingHead(now.getMinutes(), 2) + ":" +
            paddingHead(now.getSeconds(), 2) + "." +
            paddingTail(now.getMilliseconds(), 3);
    };


    _error = function(errorInfo, funcName) {
        var error = {
            debug: {
                date: this._getTime(),
                funcName: funcName
            }
        };

        if ("string" === typeof errorInfo) {
            error.error = {
                message: errorInfo
            };
        } else if ("object" === typeof errorInfo) {
            error.error = errorInfo;
        }  else if ("number" === typeof errorInfo) {
            error.error = errorInfo;
        } else {
            error.error = {
                message: "Invalid error info."
            };
        }

        return error;
    };


    /**
     * Make a HTTP request.
     * Note, the response will always be in JSON format.
     * 
     * @private
     * 
     * @param {Object}  options             - Options.
     * @param {string}  options.method      - HTTP method ("GET", "POST", etc.).
     * @param {string}  options.path        - The path is the relative request URI, which will be appended to the base URI.
     * @param {Object}  [options.headers]   - HTTP request headers.
     * @param {Object}  [options.data]      - HTTP body data.
     * 
     * @returns {Promise} Requested data.
     */
    _makeRequest = function(url = '', options) {
        var funcName    = "_makeRequest()";
        var _this       = this;
        var reqOptions  = {
            method: "GET",
            responseType: "json"
        };
        
        if ("object" !== typeof options) {
            return Promise.reject(this._error("Options is missing.", funcName));
        }

        if ("string" !== typeof options.method) {
            return Promise.reject(this._error("HTTP method is missing.", funcName));
        }

        if ("string" !== typeof options.path && url === '') {
            return Promise.reject(this._error("Path is missing.", funcName));
        }

        reqOptions.method = options.method;

        if (options.searchParams && "object" === typeof options.searchParams) {
            reqOptions.searchParams = options.searchParams;
        }

        if (options.https && "object" === typeof options.https) {
            reqOptions.https = options.https;
        }

        if (options.headers && "object" === typeof options.headers) {
            reqOptions.headers = options.headers;
        }

        if (options.data && "object" === typeof options.data) {
            reqOptions.json    = options.data;
        }

        const apiUrl = options.path ? options.path : url; 

        return got(this.url + apiUrl, reqOptions).then(function(result) {
            var description = "";

            if (true === _this._isDebugMode) {
                console.log(result);
                console.log("----------");
                console.log(JSON.stringify(result.body, null, 2));
            }

            if (200 !== result.statusCode) {
                return Promise.reject(_this._error("Bad request.", funcName));
            }

            /* Any error?
            * See com.niu.cloud.o.w.j.a()
            */
            if (result.body.error) {        
                if (0 === description.length) {
        
                    if ("object" === typeof result.body.error) {
                        if ("string" === typeof result.body.error.code) {
        
                            description = result.body.error.code;
                        } else if ("number" === typeof result.body.error.code) {
        
                            description = result.body.error.code;
                        }
                    }
                }

                return Promise.reject(_this._error(description, funcName));
            }

            return Promise.resolve(result.body.data);
        });
    };
    
    
    /**
     * check if the sid is still valid
     * @returns {string|boolean}
     */
    isLoggedIn() {
        return (this.auth.sid && (this.auth.time + this.auth.timeout) > (new Date / 1e3 | 0)) ? true : false;
    };
    
    
    /**
     * Login to your diskstation
     * @return {Promise}
     */
    _login() {
        var that = this;
    
        return new Promise(function(resolve, reject) {
            if(that.isLoggedIn()) {
                resolve("Still logged in")
            } else {
                var options = {
                    url: that.url + '/webapi/auth.cgi',
                    timeout: that.timeout,
                    qs: {
                        api: 'SYNO.API.Auth',
                        method: 'login',
                        version: 3,
                        account: that.user,
                        passwd: that.passwd,
                        session: 'homebridge-synology-' + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10),
                        format: 'sid'
                    },
                    rejectUnauthorized: false,
                    strictSSL: false
                };
    
                request.get(options, function(err, res, body) {
                    if(!err && res.statusCode === 200) {
                        var json = JSON.parse(body);
                        if ('error' in json) {
                            reject("Can't login to Diskstation. Error Code: " + json.error.code)
                        } else {
                            that.auth.sid = json.data.sid;
                            that.auth.time = (new Date / 1e3 | 0);
                            resolve('Login successfull');
                        }
                    } else {
                        reject("Can't login to Diskstation. " + err)
                    }
                });
            }
        });
    };
    
    
    /**
     * get the power State of your Diskstation
     * @param callback
     */
    getPowerState = function(callback) {
        that = this;
    
        var options = {
            url: that.url + '/webman/index.cgi',
            method: 'GET',
            timeout: that.timeout,
            rejectUnauthorized: false,
            strictSSL: false
        }
    
        request(options, function(err, res) {
            if (!err && res.statusCode === 200) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        });
    };
    
    
    /**
     * Wake on LAN support for Diskstation
     * wol has to be enabled
     * @param callback
     */
    wakeUp = function(callback) {
        var that = this;
    
        wol.wake(that.mac, function(err) {
            if (!err) {
                callback(null)
            } else {
                callback(err);
            }
        });
    };
    
    
    /**
     * Shutdown your Diskstation
     * @param callback
     */
    shutdown = function(callback) {
        var that = this;
    
        that._login().then(function() {
            var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/system.cgi';
    
            var options = {
                url: that.url + apiUrl,
                qs: {
                    api: (that.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.System',
                    version: 1,
                    method: 'shutdown',
                    _sid: that.auth.sid
                },
                method: 'GET',
                rejectUnauthorized: false,
                strictSSL: false
            };
    
            request(options, function(err, res, body) {
                (!err && res.statusCode === 200 && JSON.parse(body).success) ? callback(null): callback(err);
            });
        }).catch(function(err) {
            callback(err);
        });
    
    };
    
    
    /**
     * gets the average disk temperature
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    getDiskTemp = function(callback) {
        var that = this;
    
        that._login().then(function(res) {
            var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';
            var options = {
                url: that.url + apiUrl,
                qs: {
                    api: (that.version >= 6) ? 'SYNO.Core.System' : '',
                    version: 1,
                    method: (that.version >= 6) ? 'info' : 'getinfo',
                    type: 'storage',
                    _sid: that.auth.sid
                },
                method: 'GET',
                rejectUnauthorized: false,
                strictSSL: false
            };
    
            request(options, function(err, res, body) {
                if (!err && res.statusCode === 200) {
                    var json = JSON.parse(body);
                    if (json.success) {
                        var temp = 0;
                        for (var i = json.data.hdd_info.length; i--;) {
                            temp += json.data.hdd_info[i].temp;
                        }
                        temp = Math.round(temp / json.data.hdd_info.length);
                        callback(null, temp);
                    } else {
                        callback(err);
                    }
                } else {
                    callback(err);
                }
            });
        }).catch(function(err) {
            callback(err);
        });
    }
    
    
    /**
     * System temperature of your diskstation
     * If not available, it returns your average disk temperature
     * @param callback
     */
    getSystemTemp = function(callback) {
        var that = this;
    
        that._login().then(function() {
            var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';
            var options = {
                url: that.url + apiUrl,
                qs: {
                    api: (that.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.Info',
                    version: 1,
                    method: (that.version >= 6) ? 'info' : 'getinfo',
                    _sid: that.auth.sid
                },
                method: 'GET',
                rejectUnauthorized: false,
                strictSSL: false
            };
            request(options, function(err, res, body) {
                if (!err && res.statusCode == 200) {
                    var json = JSON.parse(body);
                    if (json.success && typeof json.data.temperature !== 'undefined') {
                        callback(null, json.data.temperature);
                    } else {
                        that.getDiskTemp(function(error, data) {
                            if(!error) {
                                callback(null, data)
                            } else {
                                callback("An error occured while getting SystemTemp: " + error)
                            }
                        });
                    }
                } else {
                    callback("An error occured while getting SystemTemp: " + err);
                }
            });
        }).catch(function(err) {
            callback("An error occured while getting SystemTemp: " + err);
        });
    };
    
    
    /**
     * returns the current cpu load
     * @param callback
     */
    getCpuLoad = function(callback) {
        var that = this;
    
        that._login().then(function() {
    
            var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/system_loading.cgi';
            var options = {
                url: that.url + apiUrl,
                qs: {
                    api: (that.version >= 6) ? 'SYNO.Core.System.Utilization' : 'SYNO.DSM.SystemLoading',
                    version: 1,
                    method: (that.version >= 6) ? 'get' : 'getinfo',
                    type: 'current',
                    resource: ['cpu'],
                    _sid: that.auth.sid
                },
                method: 'GET',
                rejectUnauthorized: false,
                strictSSL: false
            };
    
            request(options, function(err, res, body) {
                if (!err && res.statusCode == 200) {
                    var json = JSON.parse(body);
                    if (json.success) {
                        if (that.version >= 6) {
                            var load = json.data.cpu['other_load'] +
                                json.data.cpu['system_load'] +
                                json.data.cpu['user_load'];
                        } else {
                            load = Math.round(json.data.cpu.user * 100);
                        }
                        callback(null, load);
                    } else {
                        callback("An error occured while getting CpuLoad: " + json.error.code);
                    }
                } else {
                    callback("An error occured while getting CpuLoad: " + err);
                }
            });
        }).catch(function(err) {
            callback("An error occured while getting CpuLoad: " + err);
        })
    };
    
    
    /**
     * Gets the current disk/volume usage quote
     * returns the average if there are more than one volume
     * @param callback
     */
    getDiskUsage = function(callback) {
        var that = this;
    
        that._login().then(function() {
            var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/volume.cgi';
            var options = {
                url: that.url + apiUrl,
                qs: {
                    api: (that.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.Volume',
                    version: 1,
                    method: (that.version >= 6) ? 'info' : 'list',
                    type: 'storage', //only dsm >= 6
                    _sid: that.auth.sid
                },
                method: 'GET',
                rejectUnauthorized: false,
                strictSSL: false
            };
    
            request(options, function(err, res, body) {
                if (!err && res.statusCode == 200) {
                    var json = JSON.parse(body);
    
                    //dsm version 5.x
                    if (json.success && that.version < 6) {
                        var used = 0,
                            total = 0;
                        for (var i = json.data.volumes.length; i--;) {
                            used += json.data.volumes[i].used;
                            total += json.data.volumes[i].total;
                        }
                        callback(null, Math.round(used / total * 100));
    
                        //dsm version 6.x
                    } else if (json.success && that.version >= 6) {
                        var used = 0,
                            total = 0;
                        for (var i = json.data.vol_info.length; i--;) {
                            used += json.data.vol_info[i].used_size;
                            total += json.data.vol_info[i].total_size;
                        }
                        callback(null, Math.round(used / total * 100));
    
                    } else {
                        callback("An error occured while getting DiskUsage: " + json.error.code);
                    }
                } else {
                    callback("An error occured while getting DiskUsage: " + err);
                }
            });
        }).catch(function(err) {
            callback(err);
        });
    };

    getInfo = async function() {
        await this._login();

        const apiUrl = (this.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';


        const options = {
            searchParams: {
                api: (this.version >= 6) ? 'SYNO.DSM.Info' : '',
                version: 2,
                method: (this.version >= 6) ? 'getinfo' : 'getinfo',
                _sid: this.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options)
    };
}
    
module.exports = Synology;