var net = require('net');
var struct = require('./jspack.js');

module.exports = class nwsid{
	
	constructor(port, name) {
		
		this.OK = 0;
		this.BUSY = 1;
		this.ERR = 2;
		this.READ = 3;
		this.VERSION = 4;
		this.COUNT = 5;
		this.INFO = 6;

		this.CMD_FLUSH = 0;
		
		this.sid_server = net.createServer(function(socket) {
	
		});
		
		console.log("Bind SID server to " + port);
		this.sid_server.listen(port,'0.0.0.0');
		this.sid_clients = [];
		this.connect();
		
		this.last_frame = Date.now();
		this.registers=new Buffer.from(Array(33));
		this.registers[0]=0xFF;
		this.registers[1]=0xFF;
		this.registers[2]=0xFF;
		this.registers[3]=0xFF;
		this.fifo = [];
		this.fifoLength = 200;
		this.delay=0;
		this.name = name;
		this.busy_flag = false;
		this.data_cb=null;
		this.flush_cb=null;
		this.ud_time=0;
	}
	
	busy(flag){
		this.busy_flag=flag;
	}

	connect(){
		this.sid_server.on('connection', (sock) => {
			console.log('CONNECTED SID: ' + sock.remoteAddress + ':' + sock.remotePort);
			this.sid_clients.push(sock);
			sock.on('data', (data) => {
				//console.log('DATA ' + sock.remoteAddress + ': ');
				//console.log(data);
				if(data.length<4) return;
				this.sid_prot(sock,data);
			});
			sock.on('close',  () => {
				console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
				this.sid_clients.splice(this.sid_clients.indexOf(sock), 1);
			});
		});
	}

	send_ok(socket){
		let resp;
		resp = new Buffer.from(struct.Pack( '!B', [this.OK]));
		socket.write(resp);
	}
	send_busy(socket){
		let resp;
		resp = new Buffer.from(struct.Pack( '!B', [this.BUSY]));
		socket.write(resp);
	}
	send_count(socket,count){
		let resp;
		resp = new Buffer.from(struct.Pack( '!BB', [this.COUNT,count]));
		socket.write(resp);
	}
	send_info(socket,type,name){
		let temp = [];
		let resp;
		temp = struct.Pack( '!BB', [this.INFO, type]);
		resp = name.split("");
		for(let i=0;i<resp.length;i++){
			resp[i] = resp[i].charCodeAt(0);
		}
		resp.push(0x00);
		resp = new Buffer.from(temp.concat(resp));
		socket.write(resp);
	}
	send_version(socket,version){
		let resp;
		resp = new Buffer.from(struct.Pack( '!BB', [this.VERSION,version]));
		socket.write(resp);
	}
	

	sid_prot(socket, data){
		let resp;
		
		switch(data[0]){
			case this.CMD_FLUSH:
				this.ud_time=0;
				//console.log("FLUSH");
			    this.flush_cb();
				this.send_ok(socket);
			break;
			case 1:
				this.send_ok(socket);
			break;
			case 2:
				this.send_ok(socket);
			break;
			case 3:
				this.send_ok(socket);
			break;
			case 4:
				this.send_ok(socket);
			break;
			case 5:

				if(this.busy_flag==true){
					this.send_busy(socket);
					break;
				}else{
					this.send_ok(socket);
				}

				for(let i=4;i<data.length;i+=4){
					let delay = data[i]<<8;
					delay |= data[i+1];
					this.delay=delay;
					//console.log('Delay: ' + delay + ' Register: ' + data[i+2] + ' Value: ' + data[i+3])
					if(data[i+2]<25){
						this.registers[data[i+2]+4] = data[i+3];
					}
				}
                this.registers[29] = (this.ud_time & 0xFF);
                this.registers[30] = (this.ud_time>>8) & 0xFF;
                this.registers[31] = (this.ud_time>>16) & 0xFF;
				this.registers[32] = (this.ud_time>>24) & 0xFF;
				//console.log(this.registers, this.registers.length);
				this.data_cb(this.registers);
				this.ud_time += 6000;


			break;
			case 6:
				this.send_ok(socket);
			break;
			case 7:
				this.send_version(socket,2);
			break;
			case 8:
				this.send_ok(socket);
			break;
			case 9:
				this.send_ok(socket);
			break;
			case 10:
				this.send_count(socket,1);
			break;
			case 11:
				let MOS_6581 = 0
				let MOS_8580 = 1
				this.send_info(socket,MOS_6581,this.name);
			break;
			case 12:
				this.send_ok(socket);
			break;
			case 14:
				this.send_ok(socket);
			break;
		}
	}
}