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
};

exports.min_id = {
    WD:10,
    MIDI:20,
    SID:21,
    TERM:0,
    RESET:11,
    COMMAND:12,
    SOCKET:13,
    SYNTH:14};

exports.synth_cmd = {
    FLUSH:0x01,
    SID:0x02,
    MIDI:0x03,
    OFF:0x04};