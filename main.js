var min = require("./min.js");

const SerialPort = require('serialport')
const port = new SerialPort('COM8', { baudRate: 512000 })
var timer; 
var serial_buffer = [];
var telnet_buf = [];


var net = require('net');

var server = net.createServer(function(socket) {
	socket.write('Echo server\r\n');
});

server.listen(23, '127.0.0.1');

let sockets = [];

server.on('connection', function(sock) {
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
    sockets.push(sock);

    sock.on('data', function(data) {
        console.log('DATA ' + sock.remoteAddress + ': ' + data);
        let rawBuffer = Buffer.from(data,'binary');
        minsvc.min_queue_frame(0x00,rawBuffer);
        /*
        for(let i = 0;i<rawBuffer.length;i++){
                telnet_buf.push(rawBuffer[i]);
        }*/
        // Write the data back to all the connected, the client will receive it as data from the server
        
    });
});


var minsvc = new min();


minsvc.sendByte = (data) => {
	port.write(data);
}

minsvc.handler = (data) => {
    let buf = new Buffer.from(data);
	sockets.forEach(function(sock, index, array) {
	    sock.write(buf);
	});
}


port.on('open', function() {
  // open logic
  timer = setInterval(loop, 1);
  console.log("open1");
})

var count=0;
var msgcnt=0;

function loop(){
   
   minsvc.min_poll();
   /*
   if(telnet_buf.length){
        let buf=[];
        for (var i = 0;i<telnet_buf.length;i++) {
            console.log(telnet_buf[0]);
            buf.push(telnet_buf.shift());
        }
        minsvc.min_queue_frame(0x00,buf);
   }
    */

   //minsvc.min_queue_frame(0x33,buf);

   
}


// Switches the port into "flowing mode"
port.on('data', function (data) {
	//for (var i = 0;i<data.length;i++) {
      //minsvc.rx_byte(data[i]);
        minsvc.min_poll(data);
       // serial_buffer.push(data[i]);
    //}
	
})