var min = require("./min.js");
var yargs = require('yargs');

var wd_timer;
var loop_timer;

const num_con = 2;

const MIN_ID_WD=10;
const MIN_ID_MIDI=20;
const MIN_ID_TERM=0;
const MIN_ID_RESET=11;
const MIN_ID_COMMAND=12;
const MIN_ID_SOCKET=13;
    
const COMMAND_IP=1;
const COMMAND_GW=2;
const COMMAND_MAC=3;
const COMMAND_SSID=4;
const COMMAND_PASSWD=5;
const COMMAND_INFO=6;
const COMMAND_ETH_STATE=7;
const COMMAND_GET_CONFIG=8;


var argv = yargs
  	.usage('UD3-node interface\n\nUsage: $0 [options]')
	.help('help').alias('help', 'h')
  	.version('version', '0.0.1').alias('version', 'V')
	.boolean('d')
  	.options({
   		port: {
      			alias: 'p',
	      		description: "<port> serial port device",
      			requiresArg: true,
      			required: true
    		},
	    	baudrate: {
      			alias: 'b',
      			description: "<baudrate> serial port baudrate",
	      		requiresArg: true,
      			required: true
    		},
    		ip: {
      			alias: 'i',
      			description: "<ip addr:port> bind server to ip",
      			requiresArg: true,
      			required: true
    		}
  	})
	.argv;


const SerialPort = require('serialport')
var minsvc = new min();

if(argv.d){
	console.log("Debug mode");
	minsvc.debug = 1;
}


const port = new SerialPort(argv.port, { baudRate: parseInt(argv.baudrate,10) })

var net = require('net');

var server = net.createServer(function(socket) {
	
});

function send_min_socket(num, info, connect){
	if(connect == true){
		connect = 1;
	}else{
		connect = 0;
	}
	let infoBuffer = Buffer.from(String.fromCharCode(num)+ String.fromCharCode(connect) + info + String.fromCharCode(0), 'utf-8');
	minsvc.min_queue_frame(MIN_ID_SOCKET,infoBuffer);
}

var ip = argv.ip.split(':');
console.log("Bind telnet server to " + parseInt(ip[1],10));
server.listen(parseInt(ip[1],10), ip[0]);
let clients = [];
server.on('connection', function(sock) {
    console.log('CONNECTED telnet: ' + sock.remoteAddress + ':' + sock.remotePort);
	if(clients.length>=num_con){
		console.log('ERROR: Max number of clients connected');
		sock.destroy();
		return;
	}
    clients.push(sock);
	send_min_socket(clients.indexOf(sock), sock.remoteAddress, true);
    sock.on('data', function(data) {
        console.log('DATA ' + sock.remoteAddress + ': ' + data);
        let rawBuffer = Buffer.from(data,'binary');
        minsvc.min_queue_frame(clients.indexOf(sock),rawBuffer);
    });
	sock.on('close',  function () {
		console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
		send_min_socket(clients.indexOf(sock), sock.remoteAddress, false);
		clients.splice(clients.indexOf(sock), 1);
	});
});

console.log("Bind midi server to " + (parseInt(ip[1],10)+1));
server.listen(parseInt(ip[1],10)+1, ip[0]);
let midi_clients = [];
server.on('connection', function(sock) {
    console.log('CONNECTED midi: ' + sock.remoteAddress + ':' + sock.remotePort);
	if(midi_clients.length>=num_con){
		console.log('ERROR: Max number of clients connected');
		sock.destroy();
		return;
	}
    midi_clients.push(sock);
    sock.on('data', function(data) {
        console.log('DATA ' + sock.remoteAddress + ': ' + data);
        let rawBuffer = Buffer.from(data,'binary');
        minsvc.min_queue_frame(MIN_ID_MIDI,rawBuffer);
    });
	sock.on('close',  function () {
		console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
		midi_clients.splice(midi_clients.indexOf(sock), 1);
	});
});





minsvc.sendByte = (data) => {
	port.write(data);
}

minsvc.handler = (id,data) => {
    let buf = new Buffer.from(data);
	if(id <= num_con-1 && clients.length > id){
		clients[id].write(buf);
	}
}


port.on('open', function() {
  loop_timer = setInterval(loop, 5);
  wd_timer = setInterval(wd_reset, 80);
  console.log("Opened serial port " + argv.port + " at " + argv.baudrate + " baud");
});

// Switches the port into "flowing mode"
port.on('data', function (data) {
   	minsvc.min_poll(data);
});


function loop(){
   minsvc.min_poll();
}

function wd_reset(){
   if(clients.length>0){
	   minsvc.min_queue_frame(MIN_ID_WD,[]);
   }
}



