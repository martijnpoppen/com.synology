const https = require('https');
const axios = require('axios');
const wol = require('wake_on_lan');

class Synology {
    constructor(params) {
        this.ip = params.ip;
        this.mac = params.mac;
        this.secure = params.secure || false;
        this.port = params.port || (this.secure ? 5001 : 5000);
        this.timeout = parseInt(params.timeout) || 5000; //request timeout
        this.version = parseInt(params.version) || 6;

       this._isDebugMode = params.debug || false;

        this.user = params.user;
        this.passwd = params.passwd;
        this.otp_code = params.otp_code;
        this.device_id = params.device_id;
        this.auth = {
            did: '', //device id
            sid: '', //session id
            time: '', //unix time
            timeout: 15 * 60 //in sec
        };

        this.url = 'http' + (this.secure ? 's' : '') + '://' + this.ip + ':' + this.port;

        this.axiosClient = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            timeout: 0
        });
    }

    /**
     * Utility function which returns the current time in the format hh:mm:ss.us.
     *
     * @private
     *
     * @returns {string} Current time in the format hh:mm:ss.us.
     */
    getTime() {
        var now = new Date();

        var paddingHead = function (num, size) {
            var str = num + '';

            while (str.length < size) {
                str = '0' + str;
            }

            return str;
        };

        var paddingTail = function (num, size) {
            var str = num + '';

            while (str.length < size) {
                str = str + '0';
            }

            return str;
        };

        return '' + paddingHead(now.getHours(), 2) + ':' + paddingHead(now.getMinutes(), 2) + ':' + paddingHead(now.getSeconds(), 2) + '.' + paddingTail(now.getMilliseconds(), 3);
    }

    _error = function (errorInfo, funcName) {
        var error = {
            debug: {
                date: this.getTime(),
                funcName: funcName
            }
        };

        if ('string' === typeof errorInfo) {
            error.error = {
                message: errorInfo
            };
        } else if ('object' === typeof errorInfo) {
            error.error = errorInfo;
        } else if ('number' === typeof errorInfo) {
            error.error = errorInfo;
        } else {
            error.error = {
                message: 'Invalid error info.'
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
    _makeRequest = function (url = '', options) {
        var funcName = '_makeRequest()';
        var _this = this;
        var reqOptions  = {
            method: "GET",
            responseType: 'json',
            withCredentials: true
        };

        if (true === _this._isDebugMode) {
            console.log(`this.url`, this.url);
        }

        if ('object' !== typeof options) {
            return Promise.reject(this._error('Options is missing.', funcName));
        }

        if ('string' !== typeof options.method) {
            return Promise.reject(this._error('HTTP method is missing.', funcName));
        }

        if ('string' !== typeof options.path && url === '') {
            return Promise.reject(this._error('Path is missing.', funcName));
        }

        reqOptions.method = options.method;

        if (options.responseType) {
            reqOptions.responseType = options.responseType;
        }

        if (options.searchParams && 'object' === typeof options.searchParams) {
            reqOptions.params = new URLSearchParams({...options.searchParams});
        }

        if (options.https && 'object' === typeof options.https) {
            reqOptions.https = options.https;
        }

        if (options.headers && 'object' === typeof options.headers) {
            reqOptions.headers = options.headers;
        }

        if (options.data) {
            reqOptions.data = options.data;
        }   

        const apiUrl = options.path ? options.path : url;

        reqOptions.url = `${this.url}${apiUrl}`;

        return this.axiosClient(reqOptions)
            .then(function (result) {
                var description = '';
                
                if (true === _this._isDebugMode) {
                    console.log('----------');
                    if (reqOptions.responseType === 'json') {
                        console.log(JSON.stringify(result.data, null, 2));
                    } else {
                    console.log('StatusCode', result.statusCode)
                    }
                }

                if (200 !== result.status) {
                    return Promise.reject(_this._error('Bad request.', funcName));
                }

                if (result.data) {
                    return Promise.resolve({
                        ...result.data.data,
                        status: result.status
                    });
                }

                return Promise.resolve({
                    status: result.status
                });
            })
            .catch(function (error) {
                console.log('err', error);

                if (0 === description.length) {
                    if ('object' === typeof error) {
                        if ('string' === typeof error.code) {
                            description = error.code;
                        } else if ('number' === typeof error.code) {
                            description = error.code;
                        }
                    }
                }

                return Promise.reject(_this._error(description, funcName));
            });
    };

    /**
     * check if the sid is still valid
     * @returns {string|boolean}
     */
    isLoggedIn() {
        return this.auth.sid && this.auth.time + this.auth.timeout > ((new Date() / 1e3) | 0) ? true : false;
    }

    /**
     * Login to your diskstation
     * @return {Promise}
     */
    _login = async function () {
        try {
            if (this.isLoggedIn()) {
                return Promise.resolve({ status: 'loggedin' });
            } else {
                let params = {};

                if (this.otp_code && !this.device_id) {
                    params.otp_code = this.otp_code;
                }

                if (this.device_id) {
                    params.device_id = this.device_id;
                }

                const apiUrl = '/webapi/auth.cgi';

                const options = {
                    searchParams: {
                        api: 'SYNO.API.Auth',
                        version: 6,
                        method: 'login',
                        enable_device_token: 'yes',
                        account: this.user,
                        passwd: this.passwd,
                        session:
                            'homey-synology-' +
                            Math.random()
                                .toString(36)
                                .replace(/[^a-z]+/g, '')
                                .substr(0, 10),
                        ...params
                    },
                    method: 'GET'
                };

                const data = await this._makeRequest(apiUrl, options);

                if (data && data.sid && data.sid.length) {
                    if ('error' in data) {
                        return Promise.reject({ error: data.error.code });
                    } else {
                        this.auth.sid = data.sid;

                        if (data.did) {
                            this.auth.did = data.did;
                        }

                        this.auth.time = (new Date() / 1e3) | 0;
                        return Promise.resolve(data);
                    }
                } else {
                    return Promise.reject({ error: data.error });
                }
            }
        } catch (e) {
            return Promise.reject({error: e.error});
        }
    };

    /**
     * get the power State of your Diskstation
     * @param callback
     */
    getPowerState = async function () {
        var that = this;

        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        var apiUrl = that.version >= 6 ? '/webman/index.cgi' : '/webman/index.cgi';
        var options = {
            method: 'GET',
            responseType: 'text'
        };

        return this._makeRequest(apiUrl, options);
    };

    /**
     * Wake on LAN support for Diskstation
     * wol has to be enabled
     * @param callback
     */
    wakeUp = async function () {
        var that = this;

        return new Promise((resolve, reject) => {
            wol.wake(that.mac, function (err) {
                if (!err) {
                    resolve(true);
                } else {
                    reject(err);
                }
            });
        });
    };

    /**
     * Shutdown your Diskstation
     * @param callback
     */
    shutdown = async function () {
        var that = this;

        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        var apiUrl = that.version >= 6 ? '/webapi/entry.cgi' : '/webapi/dsm/system.cgi';
        var options = {
            searchParams: {
                api: that.version >= 6 ? 'SYNO.Core.System' : 'SYNO.DSM.System',
                version: 1,
                method: 'shutdown',
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options);
    };

    /**
     * gets the average disk temperature
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    getDiskTemp = async function () {
        var that = this;

        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        var apiUrl = that.version >= 6 ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';
        var options = {
            searchParams: {
                api: that.version >= 6 ? 'SYNO.Core.System' : '',
                version: 1,
                method: that.version >= 6 ? 'info' : 'getinfo',
                type: 'storage',
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options);
    };

    /**
     * System temperature of your diskstation
     * If not available, it returns your average disk temperature
     * @param callback
     */
    getSystemTemp = async function () {
        var that = this;

        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        var apiUrl = that.version >= 6 ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';
        var options = {
            searchParams: {
                api: that.version >= 6 ? 'SYNO.Core.System' : 'SYNO.DSM.Info',
                version: 1,
                method: that.version >= 6 ? 'info' : 'getinfo',
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options);
    };

    /**
     * returns the current cpu load
     * @param callback
     */
    getSystemUsage = async function () {
        var that = this;

        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        var apiUrl = that.version >= 6 ? '/webapi/entry.cgi' : '/webapi/dsm/system_loading.cgi';
        var options = {
            searchParams: {
                api: that.version >= 6 ? 'SYNO.Core.System.Utilization' : 'SYNO.DSM.SystemLoading',
                version: 1,
                method: that.version >= 6 ? 'get' : 'getinfo',
                type: 'current',
                resource: 'cpu',
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options);
    };

    /**
     * Gets the current disk/volume usage quote
     * returns the average if there are more than one volume
     * @param callback
     */
    getDiskUsage = async function () {
        var that = this;

        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        var apiUrl = that.version >= 6 ? '/webapi/entry.cgi' : '/webapi/dsm/volume.cgi';
        var options = {
            searchParams: {
                api: that.version >= 6 ? 'SYNO.Core.System' : 'SYNO.DSM.Volume',
                version: 1,
                method: that.version >= 6 ? 'info' : 'list',
                type: 'storage', //only dsm >= 6
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options);
    };

    getInfo = async function () {
        const login = await this._login();
        if (true === this._isDebugMode) {
            console.log(login);
        }

        const apiUrl = this.version >= 6 ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';

        const options = {
            searchParams: {
                api: this.version >= 6 ? 'SYNO.DSM.Info' : '',
                version: 2,
                method: this.version >= 6 ? 'getinfo' : 'getinfo',
                _sid: this.auth.sid
            },
            method: 'GET'
        };

        return this._makeRequest(apiUrl, options);
    };
}

module.exports = Synology;
