const min = require("./min.js");
const tt = require("./telemetry.js");
let telemetry = new tt();
const fs = require('fs');
const ini = require('ini');
const helper = require('./helper.js');
const _netsid = require('./nwsid.js');
const dgram = require('dgram');

const rtpmidi = require('rtpmidi');

let midibuffer = [];

var midi_clients = {num: 0, clients: []};
var command_clients = {num: 0, clients: []};


const yargs = require('yargs');
const mqtt = require('mqtt');

let mqtt_client;

let wd_timer;
let loop_timer;

let transparent_id=-1;

let num_con = 3;
let clients = Array(num_con);

var last_synth=0;

let config;



function exitHandler(options, exitCode) {

    if (options.cleanup) console.log('clean');
    if (exitCode || exitCode === 0) console.log(exitCode);
    if (options.exit) process.exit();
}

let argv = yargs
  	.usage('UD3-node interface\n\nUsage: $0 [options]')
	.help('help').alias('help', 'h')
  	.version('version', '0.0.2').alias('version', 'V')
	.boolean('d')
  	.options({
   		config: {
      			alias: 'c',
	      		description: "config file",
      			requiresArg: false,
      			required: false
    		},
		debug_min: {
      			alias: 'd',
	      		description: "min debug mode",
      			requiresArg: false,
      			required: false
    		}
  	})
	.argv;
if(argv.config){
    config = ini.parse(fs.readFileSync(argv.config, 'utf-8'));
}else{
    console.log('Config not specified using default config.ini');
    config = ini.parse(fs.readFileSync('config.ini', 'utf-8'));
}
     
let session = rtpmidi.manager.createSession({
    localName: 'Session 1',
    bonjourName: config.midiRTP.name,
    port: parseInt(config.midiRTP.port)
  });
  
session.on('ready', function() {
	
});

// Route the messages
session.on('message', function(deltaTime, message) {
	if(last_synth!==1){
		last_synth=1;
        let temp_buf=[];
		temp_buf[0]=helper.synth_cmd.MIDI;
        minsvc.min_queue_frame(helper.min_id.SYNTH,temp_buf);
	}
    midi_clients.clients.forEach((part)=> {
        midi_server.send(message, part.port, part.ip, (err) => {});
    });
	message.forEach((data)=>{
	    midibuffer.push(data);
	});

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

		  if(extName ==='.jpg' || extName === '.png' || extName === '.ico' || extName === '.eot' || extName === '.ttf' || extName === '.svg')
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
	if(sck_num===-1){
		console.log("Too many connections");
		return;
	}
    clients[sck_num]=socket;
	send_min_socket(sck_num, 'Websocket', true);

	socket.on('message', (data) => {
		let sck_num=search_socket(socket);
		if(sck_num===-1) return;
		minsvc.min_queue_frame(sck_num,data);
	});
	
	socket.on('midi message', (data) => {
		data.forEach((part)=>{
            midibuffer.push(part);
		});
	});
	
	socket.on('trans message', (data) => {
		if(!port.writable) return;
        port.write(data);
	});
	
	socket.on('ctl message', (data) => {
        let sck_num=search_socket(socket);
		switch(data){
			case 'transparent=1':
			    stop_timers();
			    if(sck_num===-1) return;
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
		if(sck_num===-1) return;
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
		if(clients[i]===socket) return i;
	}
	return -1;
}

const SerialPort = require('serialport')
var port;
if(config.serial.autodetect === true){
    let serial_list = SerialPort.list();
    serial_list.then(function(value) {
        for(let i=0;i<value.length;i++){
            if(value[i].serialNumber === config.serial.port){
                port = new SerialPort(value[i].comName, { baudRate: parseInt(config.serial.baudrate,10) });
                install_port_cb();
            }
        }
    }, function(reason) {
        console.log(reason); // Error!
    });

}else{
    port = new SerialPort(config.serial.port, { baudRate: parseInt(config.serial.baudrate,10) });
    install_port_cb();
}

function install_port_cb() {
    port.on('open', function () {
        start_timers();
        console.log("Opened serial port " + config.serial.port + " at " + config.serial.baudrate + " baud");

        if (config.mqtt.enabled) {
            telemetry.cbGaugeValue = gaugeValChange;
            telemetry.cbEvent = cbEvent;
            start_mqtt_telemetry();
        }
    });

    // Switches the port into "flowing mode"
    port.on('data', function (data) {
        if(transparent_id>-1){
            clients[transparent_id].emit('trans message', data);
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
}

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


const net = require('net');

var server = net.createServer(function(socket) {
	
});
var midi_server = dgram.createSocket('udp4');
var command_server = dgram.createSocket('udp4');


if(config.SID.enabled){
	var netsid = new _netsid(parseInt(config.SID.port),config.SID.name);

}

function send_min_socket(num, info, connect){
	if(connect === true){
		connect = 1;
	}else{
		connect = 0;
	}
	let infoBuffer = Buffer.from(String.fromCharCode(num)+ String.fromCharCode(connect) + info + String.fromCharCode(0), 'utf-8');
	minsvc.min_queue_frame(helper.min_id.SOCKET,infoBuffer);
}

console.log("Bind telnet server to " + config.telnet.port);
server.listen(parseInt(config.telnet.port),'0.0.0.0');

for(let i=0;i<num_con;i++){
	clients[i]=null;
}
server.on('connection', function(sock) {
    console.log('CONNECTED telnet: ' + sock.remoteAddress + ':' + sock.remotePort);
	let sck_num = search_slot();
	if(sck_num===-1){
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
		if(sck_num===-1) return;
        minsvc.min_queue_frame(sck_num,rawBuffer);
    });
	sock.on('close',  function () {
		console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
		let sck_num = search_socket(sock);
		if(sck_num===-1) return;
		send_min_socket(sck_num, sock.remoteAddress, false);
		clients[sck_num]=null;
	});
});


//MIDI-Server
console.log("Bind midi server to " + config.midi.port);

if(typeof(config.midi.clients) != 'undefined'){
	for(let i =0; i<config.midi.clients.length;i++){
		let arr = config.midi.clients[i].split(':');
		midi_clients.clients.push({ip:arr[0],port:arr[1]});
	}
}

midi_server.on('close', (err)=> {
    console.log('MIDI UDP socket closed')
});

midi_server.on('error', (err)=> {
	console.log('midiserver error: ',err);
	midi_server.close();
});

midi_server.on('message', (msg, rinfo)=> {
    for (let i = 0; i < msg.length; i++) {
        midibuffer.push(msg[i]);
    }
});

midi_server.on('listening', ()=> {
    console.log('MIDI-server listening');
});

midi_server.bind(config.midi.port);


if(config.watch.port>0 && config.watch.ip!=='') {
    let _watchsvr = require('./watch.js');

    let watch_server = new _watchsvr(config.watch.ip, config.watch.port);
    watch_server.set_netsid(netsid);

    watch_server.button_cb = (val) => {
    	if(val===1){
    		if(watch_server.saber_state===false) {
                watch_server.saber_start();
            }else{
                watch_server.saber_stop();
			}
		}

    }
}


//Command-Server
console.log("Bind command server to " + config.command.port);

command_server.on('close', (err)=> {
    console.log('Command UDP socket closed! ',err)
});

command_server.on('error', (err)=> {
    console.log('Commandserver Error: ', err);

    midi_server.close();
});

command_server.on('message', (msg, rinfo)=> {

	let temp = msg.toString().split(';');
	//console.log(temp);
	switch(temp[0]){
		case 'add midi-client':
            for(let i=0;i<midi_clients.clients.length;i++){
                if(rinfo.address === midi_clients.clients[i].ip && temp[1] ===  midi_clients.clients[i].port){
                    midi_clients.clients[i].alive=5000;
                	return;
                }
            }
        	midi_clients.clients.push({ip:rinfo.address,port:temp[1],alive:5000});
        	break;
        case 'add command-client':
            for(let i=0;i<command_clients.clients.length;i++){
                if(rinfo.address === command_clients.clients[i].ip && temp[1] ===  command_clients.clients[i].port){
                    command_clients.clients[i].alive=5000;
                    return;
                }
            }
            command_clients.clients.push({ip:rinfo.address,port:temp[1],alive:5000});
            break;
        case 'flush midi':
            midibuffer=[];
            let temp_buf=[];
            temp_buf[0]=helper.synth_cmd.FLUSH;
            netsid.ud_time[0]= helper.get_ticks();
            minsvc.min_queue_frame(helper.min_id.SYNTH,temp_buf);
            if(last_synth!=2){
                last_synth=2;
                temp_buf[0]=helper.synth_cmd.SID;
                minsvc.min_queue_frame(helper.min_id.SYNTH,temp_buf);
            }
            break;
		case 'time':
			helper.push_remote_offset(helper.get_local_ticks()-temp[1]);
			break;
	}

});

command_server.on('listening', ()=> {
    console.log('Command server listening');
    if(config.command.server != '') {
    	let data = Buffer.from('add midi-client;' + midi_server.address().port);
        	command_server.send(data, config.command.server_port, config.command.server, (err) => {
        });
        data = Buffer.from('add command-client;' + command_server.address().port);
        	command_server.send(data, config.command.server_port, config.command.server, (err) => {
        });
    }

});

command_server.bind(config.command.port);

function gaugeValChange(data){
	if(mqtt_client.connected){
		mqtt_client.publish(('telemetry/gauges/' + data.name), String(data.value));
        //console.log((('telemetry/gauges/' + data.name) + ' data: ' + data.value))
	}
}

function cbEvent(data){
	if(mqtt_client.connected){
		mqtt_client.publish('telemetry/event', data);
        //console.log((('telemetry/gauges/' + data.name) + ' data: ' + data.value))
	}
}


minsvc.sendByte = (data) => {
	if(!port.writable) return;
	port.write(data);
};

minsvc.handler = (id,data) => {
    
    let buf = new Buffer.from(data);
	if(id < num_con){
        
		if(clients[id] != null){
            if(typeof clients[id].write !== 'function'){
                clients[id].emit('message', data);
                
            }else{
                clients[id].write(buf);
            }
            
		}
	}else if(id === num_con){
		telemetry.receive(data);
        
	}

    if(id===helper.min_id.MIDI){
        for(let i = 0;i<data.length;i++){
			if(data[i]===0x78){
				netsid.busy(true);
			}else if(data[i]===0x6f){
                netsid.busy(false);
			}

		}
    }
};

function start_mqtt_telemetry(){
	send_min_socket(num_con,"MQTT",true);
	let rBuffer = Buffer.from("\rtterm mqtt\r", 'utf-8');
	minsvc.min_queue_frame(num_con,rBuffer);
}

function start_timers(){

	loop_timer = setInterval(()=>{
        if(midibuffer.length>0 && netsid.busy_flag===false){
            let cnt=midibuffer.length;

            if(cnt>200) cnt = 200;
            let temp_buf;
            temp_buf = midibuffer.splice(0,cnt);
            minsvc.min_queue_frame(helper.min_id.MIDI,temp_buf);
        }
        minsvc.min_poll();
	}, 10);

	wd_timer = setInterval(()=>{
	    minsvc.min_queue_frame(helper.min_id.WD, '');
	}, 200);
}

function stop_timers(){
	clearInterval(loop_timer);
	clearInterval(wd_timer);
}


netsid.data_cb = (data) => {
	midi_clients.clients.forEach((part)=> {
        midi_server.send(data, part.port, part.ip, (err) => {
        });
    });


	data.forEach((part)=>{
        midibuffer.push(part);
	});

};

netsid.flush_cb = ()=>{
    midibuffer = [];
    let temp_buf = [];
    temp_buf[0] = helper.synth_cmd.FLUSH;
    netsid.ud_time[0] = helper.get_ticks();
    minsvc.min_queue_frame(helper.min_id.SYNTH, temp_buf);
    if (last_synth !== 2) {
        last_synth = 2;
        temp_buf[0] = helper.synth_cmd.SID;
        minsvc.min_queue_frame(helper.min_id.SYNTH, temp_buf);
    }
    if (config.command.server == '') {
        command_clients.clients.forEach((part)=> {
            let data = Buffer.from('flush midi');
            command_server.send(data,part.port,part.ip, (err)=>{
            })
        });

    }
};

setInterval(()=>{
	function handle_alive(part,index,arr){
		if(part.alive>0){
			part.alive -=500;
		}else{
			arr.splice(index,1);
		}
	}




	if(config.command.server !== '') {
        let data = Buffer.from('add midi-client;' + midi_server.address().port);
        command_server.send(data, config.command.server_port, config.command.server, (err) => {
        });
        data = Buffer.from('add command-client;' + command_server.address().port);
        command_server.send(data, config.command.server_port, config.command.server, (err) => {
        });


    }else{
        midi_clients.clients.forEach(handle_alive);
        command_clients.clients.forEach(handle_alive);

        command_clients.clients.forEach((part)=>{
        	let data = Buffer.from('time;' + helper.utime());
            command_server.send(data, part.port, part.ip, (err) => {
            });
		});

	}
},500);
