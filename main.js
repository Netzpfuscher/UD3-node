var min = require("./min.js");
var tt = require("./telemetry.js");
var telemetry = new tt();



var yargs = require('yargs');
var mqtt = require('mqtt');
var mqtt_client;

var wd_timer;
var loop_timer;
var port_reopen_timer;

var transparent_id=-1;

var num_con = 3;

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
    		ts: {
      			alias: 't',
      			description: "<port> bind teslaterm server to port",
      			requiresArg: true,
      			required: true
    		},
			ws: {
      			alias: 'w',
      			description: "<port> bind webserver server to port",
      			requiresArg: false,
      			required: false
    		},
		mqtt: {
			alias: 'm',
			description: "<mqtt broker> push telemetry to broker",
                        requiresArg: false,
                        required: false
		}
  	})
	.argv;
	

if(argv.ws)	{
	var app = require('http').createServer((request, res)=>httpHandler(request, res))
	var io = require('socket.io')(app);
	var fs = require('fs');
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
		
	app.listen(parseInt(argv.ws));
	console.log('Starting webserver on '+argv.ws)

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
		minsvc.min_queue_frame(MIN_ID_MIDI,data);
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

if(argv.d){
	console.log("Debug mode");
	minsvc.debug = 1;
}


if(argv.mqtt){
	console.log("Connecting to MQTT broker...: " + argv.mqtt);
	mqtt_client = mqtt.connect(argv.mqtt);
	num_con=2;
	mqtt_client.on('connect', function (connack) {
		console.log("Connected to MQTT broker: " + argv.mqtt);
	})

}


const port = new SerialPort(argv.port, { baudRate: parseInt(argv.baudrate,10) })

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

console.log("Bind telnet server to " + argv.ts);
server.listen(parseInt(argv.ts),'0.0.0.0');
let clients = Array(num_con);
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
        console.log("SCK:" + sck_num);
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

console.log("Bind midi server to " + (parseInt(argv.ts)+1));
midi_server.listen((parseInt(argv.ts)+1),'0.0.0.0');
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
        let rawBuffer = Buffer.from(data,'binary');
        minsvc.min_queue_frame(MIN_ID_MIDI,rawBuffer);
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
    //console.log("y"+buf);
	if(clients.length >= id){
        
		if(clients[id] != null){
            if(typeof clients[id].write != 'function'){
                clients[id].emit('message', data);
                
            }else{
                clients[id].write(buf);
            }
            
		}
	}/*
	if(id==num_con){
		telemetry.receive(data);
	}*/
    if(id==MIN_ID_MIDI){
        for(let i=0;i<midi_clients.length;i++){
            if(typeof clients[id].emit == 'function'){
				//console.log(data);
				clients[id].emit('midi message', data);
			}else{
				clients[id].write(buf);
			}
        }
    }
}

function start_mqtt_telemetry(){
	send_min_socket(num_con+1,"MQTT",true);
	let rBuffer = Buffer.from("\rtterm start\r", 'utf-8');
	minsvc.min_queue_frame(num_con+1,rBuffer);
}

function start_timers(){
	loop_timer = setInterval(loop, 5);
	wd_timer = setInterval(wd_reset, 200);
}

function stop_timers(){
	clearInterval(loop_timer);
	clearInterval(wd_timer);
}

port.on('open', function() {
	start_timers();
	console.log("Opened serial port " + argv.port + " at " + argv.baudrate + " baud");

  //console.log(port);
	if(argv.mqtt){
		telemetry.cbGaugeValue = gaugeValChange;
		start_mqtt_telemetry();
	}
});

// Switches the port into "flowing mode"
port.on('data', function (data) {
	if(transparent_id>-1){
		clients[transparent_id].emit('trans message', data);
       for(let i=0;i<data.length;i++){
        console.log('Rec: ' + data[i].toString(16));   
       }
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
  //minsvc.min_poll();
 
}

function wd_reset(){
   if(clients.length>0){
	  //minsvc.min_queue_frame(MIN_ID_WD,[]);
   }
}



