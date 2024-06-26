const Homey = require('homey');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const algorithm = 'aes-256-ctr';
const secretKey = Homey.env.SECRET;
const secretKeyLegacy = Homey.env.SECRET_OLD;
const iv = crypto.randomBytes(16);

exports.sleep = async function (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

exports.rand = function() {
    return Math.floor(Math.random() * 100000);
}

exports.hash = function() {
    return crypto.randomBytes(20).toString('hex');
}

exports.synologyAsync = async function(syno, func, params = false) {
    if(params) {
        return util.promisify(func).bind(syno)(params);    
    }
    return util.promisify(func).bind(syno)();
}

exports.hoursMinutes = function(uptime){
    let s = parseInt(uptime);
    let m = Math.floor(s / 60);
    s = s % 60;
    let h = Math.floor(m / 60);
    m = m % 60;
    let d = Math.floor(h / 24);
    h = h % 24;
    h += d * 24;

    return `${h}.${m}`;
}

exports.splitTime = function(uptime, i18n){
    const numberOfHours = parseInt(uptime) / 3600;
    const Days = Math.floor(numberOfHours/24);
    const Remainder = numberOfHours % 24;
    const Hours = Math.floor(Remainder);
    const Minutes = Math.floor(60*(Remainder-Hours));
    return `${Days} ${i18n("helpers.days")} - ${Hours} ${i18n("helpers.hours")} - ${Minutes} ${i18n("helpers.minutes")}`;
}

exports.encrypt = function (text, legacy = false) {
    const secret = legacy ? secretKeyLegacy : secretKey;
    const cipher = crypto.createCipheriv(algorithm, secret, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}+${encrypted.toString('hex')}`;
};

exports.decrypt = function (hash, legacy = false) {
    const secret = legacy ? secretKeyLegacy : secretKey;
    const splittedHash = hash.split('+');
    const decipher = crypto.createDecipheriv(algorithm, secret, Buffer.from(splittedHash[0], 'hex'));

    const decrpyted = Buffer.concat([decipher.update(Buffer.from(splittedHash[1], 'hex')), decipher.final()]);

    return decrpyted.toString();
};

exports.getFilePath = async function (value, filename) {
    const dir = path.resolve(__dirname, '/userdata/');
    
 
    // await fs.chmodSync(dir, 0o755); 

    await axios.get(value, {responseType: "stream"} )  
        .then(response => {  
            response.data.pipe(fs.createWriteStream(`${dir}/${filename}`));  
        })  
        .catch(error => {  
            console.log(error);  
        });

    return `${dir}/${filename}`;
};

exports.removeFile = function(filename) {
    try {
        fs.unlinkSync(filename)
    } catch (error) {
        console.log('removeFile', error); 
    }
}

exports.getFileName = function(fileName, hashed) {
    let ext = path.basename(fileName||'');

    if(hashed) {
        const hash = crypto.randomBytes(20).toString('hex');
        ext = `${hash}.${ext.split('.')[1]}`;
    }

    return ext;
};