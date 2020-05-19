let microtime = require('microtime');

const ITEMS = 32;
let buffer = {samples:Array(ITEMS), total:0, last:0,i:0};
buffer.samples.fill(0,0,buffer.samples.length);

exports.push_remote_offset = (new_sample)=>{
    new_sample = new_sample - microtime.now();
    buffer.total -= buffer.samples[buffer.i];
    buffer.total += new_sample;
    buffer.samples[buffer.i] = new_sample;
    buffer.i = (buffer.i+1) % ITEMS;
    buffer.last = buffer.total / ITEMS;
    return buffer.last;
};

exports.utime = microtime.now;

function get_local_ticks(){
    return 4294967296-(Math.floor((microtime.now()/3.125-1000)&0xFFFFFFFF));
}
exports.get_local_ticks = get_local_ticks;

function get_ticks(){
    return 4294967296-(Math.floor(((microtime.now()+buffer.last)/3.125-1000)&0xFFFFFFFF));
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
    HIDDEN:3,
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

exports.cmd = {
    HELLO:0x01
};