let microtime = require('microtime');

function get_ticks(){
    return 4294967296-(Math.floor(microtime.now()/3.125)&0xFFFFFFFF);
}

exports.get_ticks = get_ticks;

exports.get_ticks.toArray = function (){
    let val = Array(4);
    let timecode = get_ticks();
    val[0] = (timecode >>> 24) & 0xff;
    val[1] = (timecode >>> 16) & 0xff;
    val[2] = (timecode >>> 8) & 0xff;
    val[3] = timecode & 0xff;
    return val;
};

exports.get_random_int = function (max) {
    return Math.floor(Math.random() * Math.floor(max));
}