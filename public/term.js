var connid;
var connected = 0;
var path;
const wavecolor = ["white", "red", "blue", "green", "rgb(255, 128, 0)", "rgb(128, 128, 64)", "rgb(128, 64, 128)", "rgb(64, 128, 128)", "DimGray"];
var pixel = 1;
var midi_state=[];
const simulated = false;

const kill_msg = new Uint8Array([0xB0,0x77,0x00]);

const NUM_GAUGES = 7;

var ctx;

hterm.defaultStorage = new lib.Storage.Memory();

const terminal = new hterm.Terminal();

var TIMEOUT = 50;
var response_timeout = 50;  // 50 * 20ms = 1s

const WD_TIMEOUT = 5;
var wd_reset = 5;  // 5 * 20ms = 160ms
var wd_reset_msg=new Uint8Array([0xF0,0x0F,0x00]);

var socket;
var socket_midi;

var ipaddr="0.0.0.0";


var draw_mode=0;

var midiServer;

var meters;

let busActive = false;
let busControllable = false;
let transientActive = false;

var uitime = setInterval(refresh_UI, 20);
let currentScript = null;
var ontimeUI = {totalVal: 0, relativeVal: 100, absoluteVal: 0};

var term_scope;


var ldr = new btldr((data)=> {
		wsocket.emit('trans message', data);
	},
	(state)=> {
		if(state=='not responding' || state=='finished'){
			wsocket.emit('ctl message', 'transparent=0');
		}
	}
);

ldr.set_info_cb((str) => terminal.io.println(str));
ldr.set_progress_cb((info) => progress_cb(info));

function progress_cb(info){
    //terminal.io.println('INFO: Programming done: ' + info.percent_done + '%');
    terminal.io.print('\033[2K');
    terminal.io.print('\r|');
    for(let i=0;i<50;i++){
    	if(info.percent_done>=(i*2)){
            terminal.io.print('=');
		}else{
            terminal.io.print('.');
		}
	}
    terminal.io.print('| '+ info.percent_done + '%');
}

var times = {'pw':0, 'pwd':0, 'bon':0, 'boff':0,'pw_old':0, 'pwd_old':0, 'bon_old':0, 'boff_old':0};




var onReceive = function(info) {
  if (info.socketId !== socket)
    return;
  console.log(info.data);
};

function reconnect(){
	send_command('tterm start\r');
}


var check_cnt=0;

function mergeTypedArraysUnsafe(a, b) {
    var c = new a.constructor(a.length + b.length);
    c.set(a);
    c.set(b, a.length);

    return c;
}

const byt = 29*2;
var sid_marker = new Uint8Array([0xFF,0xFF,0xFF,0xFF]);
var frame_cnt=byt
var frame_cnt_old=0;
var flow_ctl=1;
var settings_refresh=0;
function refresh_UI(){
	
	if(settings_refresh==3){
		if (times.pw != times.pw_old){
			send_command('set pw ' + times.pw + '\r');
			times.pw_old=times.pw;
		}
		if (times.pwd != times.pwd_old){
			send_command('set pwd ' + times.pwd + '\r');
			times.pwd_old=times.pwd;
		}
		if (times.bon != times.bon_old){
			send_command('set bon ' + times.bon + '\r');
			times.bon_old=times.bon;
		}
		if (times.boff != times.boff_old){
			send_command('set boff ' + times.boff + '\r');
			times.boff_old=times.boff;
		}
		settings_refresh=0;
	}else{
		settings_refresh++;
	}
	

	if(connected){
		response_timeout--;

        if (response_timeout == 0) {
            response_timeout = TIMEOUT;
            terminal.io.println('Connection lost, reconnecting...');

            reconnect();
            //chrome.sockets.tcp.getInfo(socket_midi, midi_socket_ckeck);
            //chrome.sockets.tcp.getInfo(socket, telnet_socket_ckeck);


        }

        wd_reset--;
		if(wd_reset==0){
			wd_reset=WD_TIMEOUT;
			if(connected==2){
				//chrome.serial.send(connid, wd_reset_msg, sendcb);
			}
			if(connected==1){
				if(socket_midi){
					//chrome.sockets.tcp.send(socket_midi, wd_reset_msg, sendmidi);
				}
			}
		}
		
		
	}
	
	meters.refresh();
	
	if(sid_state==2 && flow_ctl==1){
		if(connected==1){/*
            let buf =[];
            for(let i=frame_cnt_old;i<=frame_cnt;i++){
                buf[i]=sid_file_marked[i];
            }
            console.log(buf.length);*/
			wsocket.emit('midi message', sid_file_marked.slice(frame_cnt_old,frame_cnt));
            //wsocket.emit('midi message',buf);
			//console.log(sid_file_marked.slice(frame_cnt_old,frame_cnt));
            //console.log('send');
			frame_cnt_old=frame_cnt;
			frame_cnt+=byt;
			if(frame_cnt>sid_file_marked.byteLength){
				sid_state=0;
				frame_cnt=byt;
				frame_cnt_old=0;
				console.log("finished");
			}

		}
	}
	
}

 
// Initialize player and register event handler
var Player = new MidiPlayer.Player(processMidiFromPlayer);


function processMidiFromPlayer(event){
	midi_state.progress=Player.getSongPercentRemaining();
	term_scope.redrawTop();
	wsocket.emit('midi message', event.bytes_buf);
}


terminal.onTerminalReady = function() {
  // Create a new terminal IO object and give it the foreground.
  // (The default IO object just prints warning messages about unhandled
  // things to the the JS console.)
  const io = terminal.io.push();

  processInput = send_command;
  io.onVTKeystroke = processInput;

  io.sendString = processInput;

  io.onTerminalResize = (columns, rows) => {
    // React to size changes here.
    // Secure Shell pokes at NaCl, which eventually results in
    // some ioctls on the host.
  };

  // You can call io.push() to foreground a fresh io context, which can
  // be uses to give control of the terminal to something else.  When that
  // thing is complete, should call io.pop() to restore control to the
  // previous io object.
};

const TT_GAUGE = 1;
const TT_GAUGE_CONF = 2;
const TT_CHART = 3;
const TT_CHART_DRAW = 4;
const TT_CHART_CONF = 5;
const TT_CHART_CLEAR = 6;
const TT_CHART_LINE = 7;
const TT_CHART_TEXT = 8;
const TT_CHART_TEXT_CENTER = 9;
const TT_STATE_SYNC = 10;
const TT_CONFIG_GET = 11;


const TT_UNIT_NONE = 0;
const TT_UNIT_V = 1;
const TT_UNIT_A = 2;
const TT_UNIT_W = 3;
const TT_UNIT_Hz = 4;
const TT_UNIT_C = 5;

const TYPE_UNSIGNED = 0;
const TYPE_SIGNED = 1;
const TYPE_FLOAT = 2;
const TYPE_CHAR = 3;
const TYPE_STRING = 4;


const TT_STATE_IDLE = 0;
const TT_STATE_FRAME = 1;
const TT_STATE_COLLECT = 3;

const TT_STATE_GAUGE = 10;

var term_state=0;

var chart_cnt = 0;
var chart_scale_cnt =1;

var tterm = [];

var meas_backbuffer = [];
var meas = [];

const DATA_TYPE = 0;
const DATA_LEN = 1;
const DATA_NUM = 2;

var udconfig=[];

function compute(dat){
	let str;
	let x;
	let y;
	let color;
	let size;
	let chart_num;
	switch(dat[DATA_TYPE]){
		case TT_GAUGE:
			meters.value(dat[DATA_NUM], helper.bytes_to_signed(dat[3],dat[4]));
		break;
		case TT_GAUGE_CONF:
			let gauge_num = dat[2].valueOf();
			let gauge_min = helper.bytes_to_signed(dat[3],dat[4]);
			let gauge_max = helper.bytes_to_signed(dat[5],dat[6]);
			dat.splice(0,7);
			str = helper.convertArrayBufferToString(dat);
			meters.text(gauge_num, str);
			meters.range(gauge_num, gauge_min, gauge_max);
		break;
		case TT_CHART_CONF:

			chart_num = dat[2].valueOf();
			tterm[chart_num].min = helper.bytes_to_signed(dat[3],dat[4]);
			tterm[chart_num].max = helper.bytes_to_signed(dat[5],dat[6]);
			if(tterm[chart_num].min<0){
				tterm[chart_num].span=((tterm[chart_num].min*-1)+tterm[chart_num].max);
			}else{
				tterm[chart_num].span=(tterm[chart_num].max-tterm[chart_num].min);
			}
			tterm[chart_num].count_div=tterm[chart_num].span/5;
			tterm[chart_num].offset = helper.bytes_to_signed(dat[7],dat[8]);
			switch(dat[9]){
				case TT_UNIT_NONE:
					tterm[chart_num].unit = '';
				break;
				case TT_UNIT_V:
					tterm[chart_num].unit = 'V';
				break;
				case TT_UNIT_A:
					tterm[chart_num].unit = 'A';
				break;
				case TT_UNIT_W:
					tterm[chart_num].unit = 'W';
				break;
				case TT_UNIT_Hz:
					tterm[chart_num].unit = 'Hz';
				break;
				case TT_UNIT_C:
					tterm[chart_num].unit = '°C';
				break;
			}
			dat.splice(0,10);
			tterm[chart_num].name = helper.convertArrayBufferToString(dat);
			term_scope.redrawInfo();
			term_scope.redrawMeas();

		break;
		case TT_CHART:
            let val=helper.bytes_to_signed(dat[3],dat[4]);
			chart_num= dat[DATA_NUM].valueOf();
			tterm[chart_num].value_real = val;
			tterm[chart_num].value=(1/tterm[chart_num].span) *(val-tterm[chart_num].offset);
			if(tterm[chart_num].value > 1) tterm[chart_num].value = 1;
			if(tterm[chart_num].value < -1) tterm[chart_num].value = -1;
		break;
		case TT_CHART_DRAW:
			if(draw_mode==1){
				term_scope.chart_cls();
				term_scope.draw_grid();
				term_scope.redrawTrigger();
				term_scope.redrawMeas();

				draw_mode=0;
			}
			if(tterm.trigger==-1){
				term_scope.plot();
			}else{
				let triggered = Math.sign(tterm.trigger_lvl)==Math.sign(tterm[tterm.trigger].value - tterm.trigger_lvl);
				switch(tterm.trigger_block){
					case 0:
						if(term_scope.plot.xpos==11 && triggered){
							tterm.trigger_block=1;
						}
					break;
					case 1:
						if(tterm.trigger_trgt || triggered){
							tterm.trigger_trgt=1;
							term_scope.plot();
						}
						if(tterm.trigger_trgt!=tterm.trigger_old) term_scope.redrawMeas();
						tterm.trigger_old = tterm.trigger_trgt;

					break;
				}

			}
		break;
		case TT_CHART_CLEAR:
			term_scope.chart_cls();
			draw_mode=1;
		break;
		case TT_CHART_LINE:
			let x1 = helper.bytes_to_signed(dat[2],dat[3]);
			let y1 = helper.bytes_to_signed(dat[4],dat[5]);
            let x2 = helper.bytes_to_signed(dat[6],dat[7]);
            let y2 = helper.bytes_to_signed(dat[8],dat[9]);
            color = dat[10].valueOf();
			ctx.beginPath();
			ctx.lineWidth = pixel;
			ctx.strokeStyle = wavecolor[color];
			ctx.moveTo(x1,y1);
			ctx.lineTo(x2,y2);
			ctx.stroke();

		break;
		case TT_CHART_TEXT:
			x = helper.bytes_to_signed(dat[2],dat[3]);
            y = helper.bytes_to_signed(dat[4], dat[5]);
            color = dat[6].valueOf();
			size = dat[7].valueOf();
			if(size<6) size=6;
			dat.splice(0,8);
			str = helper.convertArrayBufferToString(dat);
			ctx.font = size + "px Arial";
			ctx.textAlign = "left";
			ctx.fillStyle = wavecolor[color];
			ctx.fillText(str,x, y);
		break;
		case TT_CHART_TEXT_CENTER:
			x = helper.bytes_to_signed(dat[2],dat[3]);
            y = helper.bytes_to_signed(dat[4], dat[5]);
            color = dat[6].valueOf();
			size = dat[7].valueOf();
			if(size<6) size=6;
			dat.splice(0,8);
			str = helper.convertArrayBufferToString(dat);
			ctx.font = size + "px Arial";
			ctx.textAlign = "center";
			ctx.fillStyle = wavecolor[color];
			ctx.fillText(str,x, y);
		break;
		case TT_STATE_SYNC:
			setBusActive((dat[2]&1)!=0);
			setTransientActive((dat[2]&2)!=0);
			setBusControllable((dat[2]&4)!=0);
			break;
		case TT_CONFIG_GET:
			dat.splice(0,2);
			str = helper.convertArrayBufferToString(dat, false);
			if(str == "NULL;NULL"){
				term_ui.ud_settings(udconfig);
			}else{
				let substrings = str.split(";")
				udconfig.push(substrings);
			}
		break;
	}
}

function setBusActive(active) {
	if (active!=busActive) {
		busActive = active;
		if (busControllable) {
			helper.changeMenuEntry("mnu_command", "bus", "Bus "+(busActive?"OFF":"ON"));
		}
		updateSliderAvailability();
	}
}

function setTransientActive(active) {
	if (active!=transientActive) {
		transientActive = active;
		helper.changeMenuEntry("mnu_command", "transient", "TR "+(transientActive?"Stop":"Start"));
		updateSliderAvailability();
	}
}

function setBusControllable(controllable) {
	if (controllable!=busControllable) {
		busControllable = controllable;
		//{ text: 'BUS ON', icon: 'fa fa-bolt', id: 'bus'}
		if (busControllable) {
			helper.addFirstMenuEntry("mnu_command", "bus", "Bus "+(busActive?"OFF":"ON"), 'fa fa-bolt');
		} else {
			helper.removeMenuEntry("mnu_command", "bus");
		}

		updateSliderAvailability();
	}
}

function updateSliderAvailability() {
	const busMaybeActive = busActive || !busControllable;
	const offDisable = !(transientActive && busMaybeActive);
	for (let i = 1; i <= 3; ++i) {
		const slider = $(".w2ui-panel-content .scopeview #slider" + i)[0];
		slider.className = offDisable?"slider-gray":"slider";
	}
	const onDisable = !busMaybeActive;
	ontimeUI.slider.className = onDisable?"slider-gray":"slider";
}

function receive(info){
	/*
	if(info.socketId==socket_midi){
		var buf = new Uint8Array(info.data);
		if(buf[0]==0x78){
			flow_ctl=0;
		}
		if(buf[0]==0x6f){
			flow_ctl=1;
		}
	}
	if(connected==1){
		if (info.socketId!=socket) {
			return;
		}
	}
	if(info.socketId == ldr.socket) return;
*/
	
	var buf = new Uint8Array(info);
	var txt = '';
	
	response_timeout = TIMEOUT;
	check_cnt=0;
	
	for (var i = 0; i < buf.length; i++) {
		
			
		switch(term_state){
			case TT_STATE_IDLE:
				if(buf[i]== 0xff){
					term_state = TT_STATE_FRAME;
				}else{
					var str = String.fromCharCode.apply(null, [buf[i]]);
					terminal.io.print(str);
				}
			break;
				
			case TT_STATE_FRAME:
				receive.buffer[DATA_LEN]=buf[i];
				receive.bytes_done=0;
				term_state=TT_STATE_COLLECT;
			break;
			
			case TT_STATE_COLLECT:
				
				if(receive.bytes_done==0){
					receive.buffer[0] = buf[i];
					receive.bytes_done++;
					break;
				}else{
					
					if(receive.bytes_done<receive.buffer[DATA_LEN]-1){
						receive.buffer[receive.bytes_done+1]=buf[i]
						receive.bytes_done++;
					}else{
						receive.buffer[receive.bytes_done+1]=buf[i];
						receive.bytes_done=0;
						term_state=TT_STATE_IDLE;
						compute(receive.buffer);
						receive.buffer=[];
					}
				}
				
			break;
	

		}
	}
}
receive.buffer = [];
receive.bytes_done = 0;


function start_conf(){
	send_command('\r');
	send_command('set pw 0\r');
	send_command('set pwd 50000\r');
	send_command('kill reset\rtterm start\rcls\r');
}



const wsocket = new io();
wsocket.on('connect', () => {
        connected=1;
      terminal.io.println("Connected to Websocket");
	  start_conf();
    });
wsocket.on('message', (data) => {
      receive(data);
    });	
wsocket.on('trans message', (data) => {
      ldr.read(data);
    });	
wsocket.on('midi message', (data) => {

		if(data[0]==0x78){
			flow_ctl=0;
		}
		if(data[0]==0x6f){
			flow_ctl=1;
		}
    });	


function clear(){
	terminal.io.print('\033[2J\033[0;0H');
	send_command('cls\r');

}


function send_command(command){
	wsocket.emit('message', command);
}

function readmidi(file){

	var fs = new FileReader();
	fs.readAsArrayBuffer(file);
	fs.onload = event_read_midi;
	
}
var simpleIni;

function readTextFile(file)
{     
     var rawFile = new XMLHttpRequest();
     rawFile.open("GET", file, true);
     rawFile.onreadystatechange = function ()
     {
         if(rawFile.readyState === 4)
         {
             if(rawFile.status === 200 || rawFile.status == 0)
             {
		 
				simpleIni = new SimpleIni(function() { 
        			return rawFile.responseText;
				 });
             }
         }
     }  
	 rawFile.send(null); 
}



function event_read_midi(progressEvent){

	Player.loadArrayBuffer(progressEvent.srcElement.result);

}


function loadMidiFile(file) {
	w2ui['toolbar'].get('mnu_midi').text = 'MIDI-File: '+file.name;
	w2ui['toolbar'].refresh();
	midi_state.file = file.name;
	readmidi(file);
}

function loadSIDFile(file) {
	w2ui['toolbar'].get('mnu_midi').text = 'SID-File: '+file.name;
	w2ui['toolbar'].refresh();
	midi_state.file = file.name;
	readSID(file);
}

function readSID(file){
	var fs = new FileReader();
	fs.readAsArrayBuffer(file);
	fs.onload = event_read_SID;
}
var sid_file_marked;
var sid_state=0;
function event_read_SID(progressEvent){
	var cnt=0;
    var sid_file = new Array(progressEvent.srcElement.result.byteLength + ((progressEvent.srcElement.result.byteLength/25)*4));
	//var sid_file = new Uint8Array(progressEvent.srcElement.result.byteLength + ((progressEvent.srcElement.result.byteLength/25)*4));
	var source_cnt=0;
	var file = new Uint8Array(progressEvent.srcElement.result)
	sid_file[cnt++] = 0xFF;
	sid_file[cnt++] = 0xFF;
	sid_file[cnt++] = 0xFF;
	sid_file[cnt++] = 0xFF;
	
	
	while(source_cnt<file.byteLength){
		sid_file[cnt++]=file[source_cnt++];
		if(!(source_cnt%25)){
			sid_file[cnt++] = 0xFF;
			sid_file[cnt++] = 0xFF;
			sid_file[cnt++] = 0xFF;
			sid_file[cnt++] = 0xFF;
		}
	}
	sid_file_marked=sid_file;
	sid_state=1;
	
}



function startCurrentMidiFile() {
	midi_state.state = 'playing';
	Player.play();
	term_scope.redrawTop();
}

function stopMidiFile() {
	Player.stop();
	midi_state.state = 'stopped';
	term_scope.redrawTop();
}

function ondrop(e){
   e.stopPropagation();
   e.preventDefault();
   if(e.dataTransfer.items.length == 1){//only one file
		sid_state=0;
   		const file = e.dataTransfer.files[0];
		const extension = file.name.substring(file.name.lastIndexOf(".")+1);
		if (extension==="mid"){
			loadMidiFile(file);
		} else if (extension=="js") {
			scripting.loadScript(file.path)
				.then((script)=> {
					currentScript = script;
					w2ui['toolbar'].get('mnu_script').text = 'Script: '+file.name;
					w2ui['toolbar'].refresh();
				})
				.catch((err)=>{
					terminal.io.println("Failed to load script: "+err);
					console.log(err);
				});
		}else if (extension=="dmp") {
			loadSIDFile(file);
		}else if (extension=="cyacd") {
            send_command('\rbootloader\r');
            setTimeout(() => {
                wsocket.emit('ctl message', 'transparent=1');
                setTimeout(() => {
                    ldr.connect();
                    setTimeout(() => {
                        ldr.cyacd(file);
                    }, 500); 
                }, 500);   
            }, 1000);
			
        }
   }
}

function ondragover(e){
   e.stopPropagation();
   e.preventDefault();
   e.dataTransfer.dropEffect = 'copy';
}

function warn_energ() {
    w2confirm('WARNING!<br>The coil will be energized.')
    .no(function () { })
	.yes(function () { send_command('bus on\r'); });
}

function warn_eeprom_save() {
    w2confirm('WARNING!<br>Are you sure to save the configuration to EEPROM?')
    .no(function () { })
	.yes(function () { send_command('eeprom save\r'); });
}
function warn_eeprom_load() {
    w2confirm('WARNING!<br>Are you sure to load the configuration from EEPROM?')
    .no(function () { })
	.yes(function () { send_command('eeprom load\r'); });
}



function setSliderValue(name, value, slider = undefined) {
	if (!slider) {
		slider = document.getElementById(name);
	}
	if (value<slider.min||value>slider.max) {
		terminal.io.println("Tried to set slider \""+slider.id+"\" out of range (To "+value+")!");
		value = Math.min(slider.max, Math.max(slider.min, value));
	}
	slider.value = value;
}

function ontimeSliderMoved(){
	if (ontimeUI.relativeSelect.checked) {
		setRelativeOntime(parseInt(ontimeUI.slider.value));
	} else {
		setAbsoluteOntime(parseInt(ontimeUI.slider.value));
	}
}

function ontimeChanged() {
	ontimeUI.totalVal = Math.round(ontimeUI.absoluteVal*ontimeUI.relativeVal/100.);
	times.pw = ontimeUI.totalVal;
	//send_command('set pw ' + ontimeUI.totalVal + '\r');
	updateOntimeLabels();
}

function setAbsoluteOntime(time) {
	if (!ontimeUI.relativeSelect.checked) {
		setSliderValue(null, time, ontimeUI.slider);
	}
	time = Math.min(maxOntime, Math.max(0, time));
	ontimeUI.absolute.textContent = ontimeUI.absoluteVal = time;
	ontimeChanged();
}

function setRelativeOntime(percentage) {
	if (ontimeUI.relativeSelect.checked) {
		setSliderValue(null, percentage, ontimeUI.slider);
	}
	percentage = Math.min(100, Math.max(0, percentage));
	ontimeUI.relative.textContent = ontimeUI.relativeVal = percentage;
	midiServer.sendRelativeOntime(ontimeUI.relativeVal);
	ontimeChanged();
}

function updateOntimeLabels() {
	if (ontimeUI.relativeSelect.checked) {
		ontimeUI.relative.innerHTML = "<b>"+ontimeUI.relativeVal+"</b>";
		ontimeUI.absolute.innerHTML = ontimeUI.absoluteVal;
	} else {
		ontimeUI.absolute.innerHTML = "<b>"+ontimeUI.absoluteVal+"</b>";
		ontimeUI.relative.innerHTML = ontimeUI.relativeVal;
	}
	ontimeUI.total.innerHTML = ontimeUI.totalVal;
}

function onRelativeOntimeSelect() {
	if (ontimeUI.relativeSelect.checked) {
		ontimeUI.slider.max = 100;
		ontimeUI.slider.value = ontimeUI.relativeVal;
	} else {
		ontimeUI.slider.max = maxOntime;
		ontimeUI.slider.value = ontimeUI.absoluteVal;
	}
	updateOntimeLabels();
}

function setBPS(bps){
	setSliderValue("slider1", bps);
	slider1();
}

function setBurstOntime(time){
	setSliderValue("slider2", time);
	slider2();
}

function setBurstOfftime(time){
	setSliderValue("slider3", time);
	slider3();
}



function stopMidiOutput() {
	playMidiData([0xB0,0x7B,0x00]);
	//console.log(midiOut);
}



const maxOntime = 400;
const maxBPS = 1000;
const maxBurstOntime = 1000;
const maxBurstOfftime = 1000;


function stopTransient() {
	send_command('tr stop\r');
}

function startTransient() {
	ontimeChanged();
	send_command('tr start\r');
}



document.addEventListener('DOMContentLoaded', function () {

	$(function () {
    $('#toolbar').w2toolbar({
        name: 'toolbar',
        items: [
		    { type: 'menu', id: 'mnu_command', text: 'Commands', icon: 'fa fa-table', items: [
				{ text: 'TR Start', icon: 'fa fa-bolt', id: 'transient'},
				{ text: 'Save EEPROM-Config', icon: 'fa fa-microchip'},
				{ text: 'Load EEPROM-Config', icon: 'fa fa-microchip'},
				{ text: 'Settings', id: 'settings', icon: 'fa fa-table'},
				{ text: 'Bootloader', id: 'bootloader', icon: 'fa fa-microchip'}
            ]},
			
			{ type: 'menu-radio', id: 'trigger_radio', icon: 'fa fa-star',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('trigger_radio:' + item.selected);
					switch(item.selected){
						case 'waveoff':
							tterm.trigger=-1;
						break;
						case 'waveoid0':
							tterm.trigger=0;
						break;
						case 'waveoid1':
							tterm.trigger=1;
						break;
						case 'waveoid2':
							tterm.trigger=2;
						break;
						case 'waveoid3':
							tterm.trigger=3;
						break;
						case 'waveoid4':
							tterm.trigger=4;
						break;
						case 'waveoid5':
							tterm.trigger=5;
						break;
					}
					term_scope.redrawMeas();
					term_scope.redrawTrigger();
					term_scope.redrawInfo();
                    return 'Trigger: ' + el.text;
                },
                selected: 'waveoff',
                items: [
					{ id: 'waveoff', text: 'Off'},
                    { id: 'waveoid0', text: 'Wave 0'},
					{ id: 'waveoid1', text: 'Wave 1'},
					{ id: 'waveoid2', text: 'Wave 2'},
					{ id: 'waveoid3', text: 'Wave 3'},
					{ id: 'waveoid4', text: 'Wave 4'},
					{ id: 'waveoid5', text: 'Wave 5'}
                ]
            },
			
			{ type: 'menu-radio', id: 'trigger_opt', icon: 'fa fa-star',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('trigger_opt:' + item.selected);
					switch(item.selected){
						case 'trg_pos':
							tterm.trigger_opt=0;
						break;
						case 'trg_neg':
							tterm.trigger_opt=1;
						break;
					}
                    return 'Trigger: ' + el.text;
                },
				selected: 'trg_pos',
                items: [
					{ id: 'trg_pos', text: 'Positive'},
                    { id: 'trg_neg', text: 'Negative'}
                ]
            },
			
			{ type: 'menu', id: 'mnu_midi', text: 'MIDI-File: none', icon: 'fa fa-table', items: [
                { text: 'Play', icon: 'fa fa-bolt'},
				{ text: 'Stop', icon: 'fa fa-bolt'}
            ]},
			
			{ type: 'menu', id: 'mnu_script', text: 'Script: none', icon: 'fa fa-table', items: [
				{ text: 'Start', icon: 'fa fa-bolt'},
				{ text: 'Stop', icon: 'fa fa-bolt'}
            ]},
			
            { type: 'spacer' },
			{ type: 'button', id: 'kill_set', text: 'KILL SET', icon: 'fa fa-power-off' },
			{ type: 'button', id: 'kill_reset', text: 'KILL RESET', icon: 'fa fa-power-off' },
			{ type: 'button', id: 'cls', text: 'Clear Term', icon: 'fa fa-terminal' }
        ],
        onClick: function (event) {
            //console.log('Target: '+ event.target, event);
			switch (event.target) {
		
                case 'connect':
                    connect();
					
                break;
				case 'cls':
                    clear();
                break;
				case 'mnu_command:bus':
					if (busActive) {
						send_command('bus off\r');
					} else {
						warn_energ();
					}
				break;
				case 'mnu_command:transient':
					if (transientActive) {
						stopTransient();
					} else {
						startTransient();
					}
				break;
				case 'mnu_command:settings':
					udconfig = [];
					send_command('config_get\r');
					break;
                case 'mnu_command:bootloader':
                    //send_command('bootloader\r');
					wsocket.emit('ctl message', 'transparent=1');
                    setTimeout(() => ldr.connect(), 500);
                    break;
				case 'mnu_command:Load EEPROM-Config':
					warn_eeprom_load();
				break;
				case 'mnu_command:Save EEPROM-Config':
					warn_eeprom_save();
				break;
				case 'mnu_midi:Play':
					if (midi_state.file==null){
						terminal.io.println("Please select a MIDI file using drag&drop");
						break;
					}
					if(sid_state==0){
						send_command('set synth 1\r');
						startCurrentMidiFile();
					}

					//startCurrentMidiFile();
					if(sid_state==1){
						send_command('set synth 2\r');
						sid_state=2;
					}
				break;
				case 'mnu_midi:Stop':
					//midiOut.send(kill_msg);
					send_command('set synth 0\r');
                    /*
					if (midi_state.file==null || midi_state.state!='playing'){
						terminal.io.println("No MIDI file is currently playing");
						break;
					}*/
					//stopMidiFile();
					if(sid_state==2){
						sid_state=1;
						frame_cnt=byt;
						frame_cnt_old=0;
					}
				break;
				case 'mnu_script:Start':
					if (currentScript==null) {
						terminal.io.println("Please select a script file using drag&drop first");
						break;
					}
					scripting.startScript(currentScript);
					break;
				case 'mnu_script:Stop':
					if (currentScript==null) {
						terminal.io.println("Please select a script file using drag&drop first");
						break;
					}
					if (!scripting.isRunning()) {
						terminal.io.println("The script can not be stopped since it isn't running");
						break;
					}
					scripting.cancel();
					break;
				case 'kill_set':
					send_command('kill set\r');
				break;
				case 'kill_reset':
					send_command('kill reset\r');
				break;
            }
        }
    });
});
	

	var html_gauges='';
	for(var i=0;i<NUM_GAUGES;i++){
		html_gauges+='<div id="gauge'+ i +'" style= "width: 100px; height: 100px"></div>'
	}

	
	
	var pstyle = 'background-color: #F5F6F7;  padding: 5px;';
	$('#layout').w2layout({
		name: 'layout',
		panels: [
			{ type: 'top',  size: 50, overflow: "hidden", resizable: false, style: pstyle, content:
				'<div id="toolbar" style="padding: 4px; border: 1px solid #dfdfdf; border-radius: 3px"></div>'
			},
			{ type: 'main', style: pstyle, content:
				'<div class="scopeview">'+
				'<article>'+
				'<canvas id="waveback" style= "position: absolute; left: 0; top: 0; width: 75%; background: black; z-index: 0;"></canvas>'+
				'<canvas id="wavecanvas" style= "position: absolute; left: 0; top: 0;width: 75%; z-index: 1;"></canvas>'+
				'</article>'+
				'<aside>'+
				'<div id="ontime">Ontime<br><br>'+
				'<input type="range" id="slider" min="0" max="'+maxOntime+'" value="0" class="slider-gray" data-show-value="true">' +
				'<input type="checkbox" id="relativeSelect"><label for="relativeSelect">Relative</label>' +
				'<br><span id="total">0</span> µs (<span id="relative">100</span>% of <span id="absolute"><b>0</b></span> µs)</div>'+
				'<br><br>Offtime<br><br>'+
				'<input type="range" id="slider1" min="20" max="'+maxBPS+'" value="1" class="slider-gray" data-show-value="true"><label id="slider1_disp">20 Hz</label>'+
				'<br><br>Burst On<br><br>'+
				'<input type="range" id="slider2" min="0" max="'+maxBurstOntime+'" value="0" class="slider-gray" data-show-value="true"><label id="slider2_disp">0 ms</label>'+
				'<br><br>Burst Off<br><br>'+
				'<input type="range" id="slider3" min="0" max="'+maxBurstOfftime+'" value="500" class="slider-gray" data-show-value="true"><label id="slider3_disp">500 ms</label>'+
				'</aside>'+
				'</div>'
			},
			{ type: 'right', size: 120, resizable: false, style: pstyle, content:
				(html_gauges)
			},
			
			{ type: 'preview'	, size: '50%', resizable: true, style: pstyle, content:
				'<div id="terminal" style="position:relative; width:100%; height:100%"></div>' 
			},

		]
	});
	

	w2ui['layout'].on({ type : 'resize', execute : 'after'}, function (target, eventData) {
		term_scope.resize();
	});
	terminal.decorate(document.querySelector('#terminal'));
	terminal.installKeyboard();
	
	document.getElementById('layout').addEventListener("drop", (e) => ondrop(e));
	document.getElementById('layout').addEventListener("dragover", ondragover);
	ontimeUI.slider = $(".w2ui-panel-content .scopeview #ontime #slider")[0];
	ontimeUI.relativeSelect = $(".w2ui-panel-content .scopeview #ontime #relativeSelect")[0];
	ontimeUI.total = $(".w2ui-panel-content .scopeview #ontime #total")[0];
	ontimeUI.relative = $(".w2ui-panel-content .scopeview #ontime #relative")[0];
	ontimeUI.absolute = $(".w2ui-panel-content .scopeview #ontime #absolute")[0];
	ontimeUI.slider.addEventListener("input", ontimeSliderMoved);
	ontimeUI.relativeSelect.onclick = onRelativeOntimeSelect;
	ontimeUI.setRelativeAllowed = function(allow) {
		if (allow) {
			ontimeUI.relativeSelect.disabled = false;
		} else {
			ontimeUI.relativeSelect.checked = false;
			ontimeUI.relativeSelect.onclick();
			ontimeUI.relativeSelect.disabled = true;
		}
	};
	
	readTextFile('config.ini');
	
		
    ctx = document.getElementById("wavecanvas").getContext('2d');
	
	coil_hot_led=1;

	meters = new cls_meter(NUM_GAUGES);
	
	for(var i=0;i<NUM_GAUGES;i++){
		tterm.push({min: 0, max: 1024.0, offset: 1024.0,span: 2048,unit: '', value: 0, value_real: 0, count_div:0, name: ''});
		meas_backbuffer.push({min: 0, max: 0, avg_sum: 0, avg_samp: 0});
		meas.push({min: 0, max: 0, avg: 0});
		
	}

	tterm.trigger=-1;
	tterm.trigger_lvl= 0;
	tterm.value_old= 0;
	tterm.trigger_lvl_real=0;
	tterm.trigger_trgt=0;
	tterm.trigger_old=0;
	tterm.trigger_block=0;
	
	
	term_scope = new scope(	tterm,
							'wavecanvas',
							'waveback');
	
	

	midi_state.progress = 0;

});

// Allow multiple windows to be opened

