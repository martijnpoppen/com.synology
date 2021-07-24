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