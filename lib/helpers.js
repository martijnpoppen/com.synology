const crypto = require('crypto');

const algorithm = 'aes-256-ctr';
const secretKey = 'SCm01z2GtOyMZksEQNT0lM4jomZaQFdN';
const iv = crypto.randomBytes(16);

exports.sleep = async function (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

exports.rand = function() {
    return Math.floor(Math.random() * 100000);
}

exports.synologyAsync = async function(syno, func, params = false) {
    if(params) {
        return util.promisify(func).bind(syno)(params);    
    }
    return util.promisify(func).bind(syno)();
}

exports.encrypt = function (text) {
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}+${encrypted.toString('hex')}`;
};

exports.decrypt = function (hash) {
    const splittedHash = hash.split('+');
    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(splittedHash[0], 'hex'));

    const decrpyted = Buffer.concat([decipher.update(Buffer.from(splittedHash[1], 'hex')), decipher.final()]);

    return decrpyted.toString();
};