var min = require("./min.js");
var tt = require("./telemetry.js");
var telemetry = new tt();
var fs = require('fs');
var ini = require('ini');

var rtpmidi = require('rtpmidi');

var midibuffer = [];



var yargs = require('yargs');
var mqtt = require('mqtt');
var mqtt_client;

var wd_timer;
var loop_timer;
var port_reopen_timer;

var transparent_id=-1;

var num_con = 3;
var clients = Array(num_con);

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
  	.version('version', '0.0.2').alias('version', 'V')
	.boolean('d')
  	.options({
   		config: {
      			alias: 'c',
	      		description: "config file",
      			requiresArg: true,
      			required: true
    		},
		debug_min: {
      			alias: 'dm',
	      		description: "min debug mode",
      			requiresArg: false,
      			required: false
    		}
  	})
	.argv;
var config = ini.parse(fs.readFileSync(argv.config, 'utf-8'));

var session = rtpmidi.manager.createSession({
    localName: 'Session 1',
    bonjourName: 'Node RTPMidi',
    port: 5006
  });
  
session.on('ready', function() {
	
});

// Route the messages
session.on('message', function(deltaTime, message) {
  for(let i=0;i<message.length;i++){
      midibuffer.push(message[i]);
  }
});


if(config.webserver.enabled)	{
	var app = require('http').createServer((request, res)=>httpHandler(request, res))
	var io = require('socket.io')(app);
	const url = require('url');
	const path = require('path');

	let mimeTypes = {
	  '.html': 'text/html',
	  '.css': 'text/css',
	  '.ini': 'text/plain',
	  '.js': 'text/javascript',
	  '.jpg': 'image/jpeg',
	  '.png': 'image/png',
	  '.ico': 'image/x-icon',
	  '.svg': 'image/svg+xml',
	  '.eot': 'appliaction/vnd.ms-fontobject',
	  '.ttf': 'aplication/font-sfnt'
	};	
		
	app.listen(parseInt(config.webserver.port));
	console.log('Starting webserver on ' + config.webserver.port)

	function httpHandler (request, res) {
	  let pathName = url.parse(request.url).path;
	  if(pathName === '/'){
		pathName = '/index.html';
	  }
	  pathName = pathName.substring(1, pathName.length);
	  let extName = path.extname(pathName);
	  let staticFiles = `${__dirname}/public/${pathName}`;

		  if(extName =='.jpg' || extName == '.png' || extName == '.ico' || extName == '.eot' || extName == '.ttf' || extName == '.svg')
		  {
			  if(fs.existsSync(staticFiles)){
				  let file = fs.readFileSync(staticFiles);
				  res.writeHead(200, {'Content-Type': mimeTypes[extName]});
				  res.write(file, 'binary');
				  
			  }else{
				console.log('HTTP: File not Found: ' + staticFiles);
				res.writeHead(404, {'Content-Type': 'text/html;charset=utf8'});
				res.write(`<strong>${staticFiles}</strong>File is not found.`);
			  }
			  res.end();
		  }else {
			fs.readFile(staticFiles, 'utf8', function (err, data) {
			  if(!err){
				res.writeHead(200, {'Content-Type': mimeTypes[extName]});
				res.end(data);
			  }else {
				res.writeHead(404, {'Content-Type': 'text/html;charset=utf8'});
				res.write(`<strong>${staticFiles}</strong>File is not found.`);
			  }
			  res.end();
			});
		  }
	}
    
	io.sockets.on('connection', (socket) => {
	console.log("New websocket connection from " + socket.id);
	let sck_num=search_slot();
	if(sck_num==-1){
		console.log("Too many connections");
		return;
	}
    clients[sck_num]=socket;
	send_min_socket(sck_num, 'Websocket', true);

	socket.on('message', (data) => {
		let sck_num=search_socket(socket);
		if(sck_num==-1) return;
		minsvc.min_queue_frame(sck_num,data);
	});
	
	socket.on('midi message', (data) => {
       // console.log(data.length);
        for(let i=0;i<data.length;i++){
            midibuffer.push(data[i]);
        }
	});
	
	socket.on('trans message', (data) => {
		if(!port.writable) return;
		console.log('Send: ' + data.length);
        port.write(data);
	});
	
	socket.on('ctl message', (data) => {
        let sck_num=search_socket(socket);
		switch(data){
			case 'transparent=1':
			stop_timers();
			if(sck_num==-1) return;
			transparent_id = sck_num;
			console.log('Transparent mode enabled');
			break;
			case 'transparent=0':
            send_min_socket(sck_num, 'Websocket', true);
			start_timers();
			transparent_id=-1;
			console.log('Transparent mode disabled');
			break;
		}
	});
	socket.on('disconnect', function () {
		console.log("Websocket connection closed from " + socket.id);
        let sck_num=search_socket(socket);
		if(sck_num==-1) return;
		send_min_socket(sck_num, 'Websocket', false);
		clients[sck_num]=null;
    });
	
});
	
}


function search_slot(){
	for(let i=0;i<clients.length;i++){
		if(clients[i]==null) return i;
	}
	return -1;
}

function search_socket(socket){
	for(let i=0;i<clients.length;i++){
		if(clients[i]==socket) return i;
	}
	return -1;
}

const SerialPort = require('serialport')
var minsvc = new min();

if(argv.debug_min){
	console.log("Debug mode");
	minsvc.debug = 1;
}


if(config.mqtt.enabled){
	console.log("Connecting to MQTT broker...: " + config.mqtt.server);
	mqtt_client = mqtt.connect(config.mqtt.server);
	num_con=2;
	mqtt_client.on('connect', function (connack) {
		console.log("Connected to MQTT broker: " + config.mqtt.server);
	})

}


const port = new SerialPort(config.serial.port, { baudRate: parseInt(config.serial.baudrate,10) })

var net = require('net');

var server = net.createServer(function(socket) {
	
});
var midi_server = net.createServer(function(socket) {
	
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

console.log("Bind telnet server to " + config.telnet.port);
server.listen(parseInt(config.telnet.port),'0.0.0.0');

for(let i=0;i<num_con;i++){
	clients[i]=null;
}
server.on('connection', function(sock) {
    console.log('CONNECTED telnet: ' + sock.remoteAddress + ':' + sock.remotePort);
	let sck_num = search_slot();
	if(sck_num==-1){
		console.log("Too many connections");
		sock.destroy();
		return;
	}
    clients[sck_num]=sock;
	send_min_socket(sck_num, sock.remoteAddress, true);
	
    sock.on('data', function(data) {
        //console.log('DATA ' + sock.remoteAddress + ': ' + data);
        let rawBuffer = Buffer.from(data,'binary');
		let sck_num = search_socket(sock);
		if(sck_num==-1) return;
        minsvc.min_queue_frame(sck_num,rawBuffer);
    });
	sock.on('close',  function () {
		console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
		let sck_num = search_socket(sock);
		if(sck_num==-1) return;
		send_min_socket(sck_num, sock.remoteAddress, false);
		clients[sck_num]=null;
	});
});

console.log("Bind midi server to " + config.midi.port);
midi_server.listen(parseInt(config.midi.port),'0.0.0.0');
let midi_clients = [];
midi_server.on('connection', function(sock) {
    console.log('CONNECTED midi: ' + sock.remoteAddress + ':' + sock.remotePort);
	if(midi_clients.length>=num_con){
		console.log('ERROR: Max number of clients connected');
		sock.destroy();
		return;
	}
    midi_clients.push(sock);
    sock.on('data', function(data) {
        //console.log('DATA ' + sock.remoteAddress + ': ' + data);
        for(let i=0;i<data.length;i++){
            midibuffer.push(data[i]);
        }
    });
	sock.on('close',  function () {
		console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
		midi_clients.splice(midi_clients.indexOf(sock), 1);
	});
});

function gaugeValChange(data){
	console.log(data);
	if(mqtt_client.connected){
		mqtt_client.publish(('telemetry/gauges/' + data.name), data.value);
	}
}



minsvc.sendByte = (data) => {
	if(!port.writable) return;
	port.write(data);
}

minsvc.handler = (id,data) => {
    let buf = new Buffer.from(data);
	//if(id <= num_con){
        
		if(clients[id] != null){
            if(typeof clients[id].write != 'function'){
                clients[id].emit('message', data);
                
            }else{
                clients[id].write(buf);
            }
            
		}
	//}//else if(id == num_con){
	//	tt.receive(data);
	//}

    if(id==MIN_ID_MIDI){
        
        for(let i=0;i<clients.length;i++){
            if(clients[i] != null){
                console.log(typeof clients[i].emit);
                if(typeof clients[i].emit == 'function'){
                    clients[i].emit('midi message', data);
                }
            }
        }
        for(let i=0;i<midi_clients.length;i++){
            midi_clients[i].write(buf);
        }
        
    }
}

function start_mqtt_telemetry(){
	send_min_socket(num_con+1,"MQTT",true);
	let rBuffer = Buffer.from("\rtterm start\r", 'utf-8');
	minsvc.min_queue_frame(num_con+1,rBuffer);
}

function start_timers(){
	loop_timer = setInterval(loop, 2);
	wd_timer = setInterval(wd_reset, 500);
}

function stop_timers(){
	clearInterval(loop_timer);
	clearInterval(wd_timer);
}

port.on('open', function() {
	start_timers();
	console.log("Opened serial port " + config.serial.port + " at " + config.serial.baudrate + " baud");

	if(config.mqtt.enabled){
		telemetry.cbGaugeValue = gaugeValChange;
		start_mqtt_telemetry();
	}
});

// Switches the port into "flowing mode"
port.on('data', function (data) {
	if(transparent_id>-1){
		clients[transparent_id].emit('trans message', data);
       //for(let i=0;i<data.length;i++){
        //console.log('Rec: ' + data[i].toString(16));   
       //}
	}else{
		minsvc.min_poll(data);
	}
});

// Switches the port into "flowing mode"
port.on('error', function (err) {
   	//console.log(err);
});
port.on('close', function (err) {
	setTimeout(() =>{
		port.open();
	}, 200);
});

function loop(){
  if(midibuffer.length>0){
      let cnt=midibuffer.length;
      if(cnt>200) cnt = 200;
      let temp_buf;
      temp_buf = midibuffer.splice(0,cnt);
      minsvc.min_queue_frame(MIN_ID_MIDI,temp_buf);
  }
  minsvc.min_poll();
 
}

function wd_reset(){
   if(clients.length>0){
	  //minsvc.min_queue_frame(MIN_ID_WD,[]);
   }
}



