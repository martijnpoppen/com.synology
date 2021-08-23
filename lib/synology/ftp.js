const Client = require('ssh2-sftp-client');

class FTP {
    constructor(data) {
        
        const {ip, port, user, passwd, path_prefix} = data;
        this.settings = {
            host: ip,
            port: port,
            username: user,
            password: passwd,
        };

        this.path_prefix = path_prefix;
    }

    upload(sourcePath, remotePath) {
        const sftp = new Client();
        return sftp.connect(this.settings)
            .then(() => sftp.exists(this.path_prefix))
            .then((data) => {
                const hasHomeyFolder = data === 'd' || false;
                if(!hasHomeyFolder) {
                    sftp.mkdir(this.path_prefix);
                }
            })
            .then(() => sftp.fastPut(sourcePath, `${this.path_prefix}${remotePath}`))
            .catch((err) => console.log(err, 'catch error'))
            .finally(() => sftp.end());
    }
}

module.exports = FTP;