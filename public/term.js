var connected = 0;
const wavecolor = ["white", "red", "blue", "green", "rgb(255, 128, 0)", "rgb(128, 128, 64)", "rgb(128, 64, 128)", "rgb(64, 128, 128)", "DimGray"];
var pixel = 1;

const kill_msg = new Uint8Array([0xB0,0x77,0x00]);

const NUM_GAUGES = 7;

var ctx;

hterm.defaultStorage = new lib.Storage.Memory();

const terminal = new hterm.Terminal();

var TIMEOUT = 50;
var response_timeout = 50;  // 50 * 20ms = 1s

var draw_mode=0;


var meters;

let busActive = false;
let busControllable = false;
let transientActive = false;

var uitime = setInterval(refresh_UI, 20);
var ontimeUI = {totalVal: 0, relativeVal: 100, absoluteVal: 0};
var offtimeUI = [];

var term_scope;


var ldr = new btldr((data)=> {
        console.log(data);
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


function reconnect(){
	send_command('tterm start\r');
}


var check_cnt=0;


var settings_refresh=0;
function refresh_UI(){
	
	if(settings_refresh==3){
		if (times.pw != times.pw_old){
			send_hidden_command('set pw ' + times.pw + '\r');
			times.pw_old=times.pw;
		}
		if (times.pwd != times.pwd_old){
			send_hidden_command('set pwd ' + times.pwd + '\r');
			times.pwd_old=times.pwd;
		}
		if (times.bon != times.bon_old){
			send_hidden_command('set bon ' + times.bon + '\r');
			times.bon_old=times.bon;
		}
		if (times.boff != times.boff_old){
			send_hidden_command('set boff ' + times.boff + '\r');
			times.boff_old=times.boff;
		}
		settings_refresh=0;
	}else{
		settings_refresh++;
	}
	

	if(connected){
		//response_timeout--;

        if (response_timeout == 0) {
            response_timeout = TIMEOUT;
            terminal.io.println('Connection lost, reconnecting...');

            reconnect();


        }

	
	}
	
	meters.refresh();

	
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
const TT_EVENT = 12;
const TT_GAUGE32 = 13;
const TT_GAUGE_CONF32 = 14;


const TT_UNIT_NONE = 0;
const TT_UNIT_V = 1;
const TT_UNIT_A = 2;
const TT_UNIT_W = 3;
const TT_UNIT_Hz = 4;
const TT_UNIT_C = 5;
const TT_UNIT_kW = 6;
const TT_UNIT_RPM = 7;

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
var term_state_hidden=0;


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
    let gauge_num;
    let gauge_min;
    let gauge_max;
	switch(dat[DATA_TYPE]){
		case TT_GAUGE:
			meters.value(dat[DATA_NUM], helper.bytes_to_signed(dat[3],dat[4]));
		break;
		case TT_GAUGE_CONF:
			gauge_num = dat[2].valueOf();
			gauge_min = helper.bytes_to_signed(dat[3],dat[4]);
			gauge_max = helper.bytes_to_signed(dat[5],dat[6]);
			dat.splice(0,7);
			str = helper.convertArrayBufferToString(dat);
			meters.min_max_label(gauge_num,gauge_min,gauge_max,str);
		break;
        case TT_GAUGE32:
            meters.value(dat[DATA_NUM], helper.bytes_to_signed32(dat[3],dat[4],dat[5],dat[6]));
            break;
        case TT_GAUGE_CONF32:
            gauge_num = dat[2].valueOf();
            gauge_min = helper.bytes_to_signed32(dat[3],dat[4],dat[5],dat[6]);
            gauge_max = helper.bytes_to_signed32(dat[7],dat[8],dat[9],dat[10]);
            meters.div[gauge_num] = helper.bytes_to_signed32(dat[11],dat[12],dat[13],dat[14]);
            dat.splice(0,15);
            str = helper.convertArrayBufferToString(dat);
            meters.min_max_label(gauge_num,gauge_min,gauge_max,str);
            meters.refresh_all();
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
	
	var buf = new Uint8Array(info);

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
let int_state='idle';
function interpret_hidden(str){
	str = str.replace(':>','');
	let data;
	str.split('\r\n').forEach((part)=>{
		if(int_state==='idle'){
			data = part.split(' ');
			switch (data[0]){
				case 'set':
					switch(data[1]){
						case 'pw':
							setAbsoluteOntime(parseInt(data[2]));
							break;
					}

					break;
				case 'get':
					switch(data[1]){
						case 'pw':
							int_state='get';
							break;
                        case 'pwd':
                            int_state='get';
                            break;
					}
					break;
			}
		}else if(int_state==='get'){
            data = part.split('=');
			data[0] = data[0].replace('\t','');
			int_state='idle';
			switch (data[0]) {
				case 'pw':
                    setAbsoluteOntime(parseInt(data[1]));
					break;
                case 'pwd':
                    setAbsoluteOfftime(parseInt(data[1]));
                    break;

            }
		}


	});
	vstr='';
}
var vstr = '';
function receive_hidden(info){

    var buf = new Uint8Array(info);

    response_timeout = TIMEOUT;
    check_cnt=0;

    for (var i = 0; i < buf.length; i++) {


        switch(term_state_hidden){
            case TT_STATE_IDLE:
                if(buf[i]== 0xff){
                    term_state_hidden = TT_STATE_FRAME;
                }else{
                	vstr += String.fromCharCode.apply(null, [buf[i]]);
                }
                break;

            case TT_STATE_FRAME:
                receive.buffer[DATA_LEN]=buf[i];
                receive.bytes_done=0;
                term_state_hidden=TT_STATE_COLLECT;
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
                        term_state_hidden=TT_STATE_IDLE;
                        compute(receive.buffer);
                        receive.buffer=[];
                    }
                }

                break;


        }
    }
    if(vstr != '' && vstr.endsWith(':>')) interpret_hidden(vstr);
}
receive.buffer = [];
receive.bytes_done = 0;


function start_conf(){
	send_command('\r');
	send_hidden_command('get pw\r');
	send_hidden_command('get pwd\r');
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
wsocket.on('hidden_message', (data) => {
    receive_hidden(data);
});
wsocket.on('trans message', (data) => {
      ldr.read(data);
    });	
wsocket.on('midi message', (data) => {
        
   });
wsocket.on('command', (data) => {
    terminal.io.println(data);
    start_conf();
});


function clear(){
	terminal.io.print('\033[2J\033[0;0H');
	send_command('cls\r');

}


function send_command(command){
	wsocket.emit('message', command);
}

function send_hidden_command(command){
    wsocket.emit('hidden_message', command);
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




function ondrop(e){
   e.stopPropagation();
   e.preventDefault();
   if(e.dataTransfer.items.length == 1){//only one file
   		const file = e.dataTransfer.files[0];
		const extension = file.name.substring(file.name.lastIndexOf(".")+1);
		if (extension=="cyacd") {
            terminal.io.println("Entering bootloader...");
            send_command('\rbootloader\r');
            setTimeout(() => {
                wsocket.emit('ctl message', 'transparent=1');
                setTimeout(() => {
                    ldr.connect();
                    setTimeout(() => {
                        ldr.cyacd(file);
                    }, 2000);
                }, 2000);
            }, 3000);
			
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

function setAbsoluteOfftime(time) {
    time = Math.min(maxOfftime, Math.max(0, time));
    let hz = Math.floor(1/(time/1000000));
    setSliderValue(null, hz, offtimeUI.slider);
    slider1();
}

function setRelativeOntime(percentage) {
	if (ontimeUI.relativeSelect.checked) {
		setSliderValue(null, percentage, ontimeUI.slider);
	}
	percentage = Math.min(100, Math.max(0, percentage));
	ontimeUI.relative.textContent = ontimeUI.relativeVal = percentage;
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

function slider1(){
	var slider = document.getElementById('slider1');
	var slider_disp = document.getElementById('slider1_disp');
	var pwd = Math.floor(1/slider.value*1000000);
	slider_disp.innerHTML = slider.value + ' Hz';
	times.pwd = pwd;
	//send_command('set pwd ' + pwd + '\r');
}


function slider2(){
	var slider = document.getElementById('slider2');
	var slider_disp = document.getElementById('slider2_disp');
	slider_disp.innerHTML = slider.value + ' ms';
	times.bon = slider.value;
	//send_command('set bon ' + slider.value + '\r');
}

function slider3(){
	var slider = document.getElementById('slider3');
	var slider_disp = document.getElementById('slider3_disp');
	slider_disp.innerHTML = slider.value + ' ms';
	times.boff = slider.value;
	//send_command('set boff ' + slider.value + '\r');
}


const maxOntime = 400;
const maxOfftime = 60000;
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

			{ type: 'menu-radio', id: 'synth', icon: 'fa fa-star',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('synth:' + item.selected);
					switch(item.selected){
						case 'off':
							send_command('set synth 0\r');
						break;
						case 'midi':
							send_command('set synth 1\r');
						break;
						case 'sid':
							send_command('set synth 2\r');
						break;
					}
                    return 'Synth: ' + el.text;
                },
				selected: 'off',
                items: [
					{ id: 'off', text: 'OFF'},
                    { id: 'midi', text: 'MIDI'},
					{ id: 'sid', text: 'SID'}
                ]
            },
			
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
					wsocket.emit('ctl message', 'transparent=1');
                    setTimeout(() => ldr.connect(), 500);
                    break;
				case 'mnu_command:Load EEPROM-Config':
					warn_eeprom_load();
				break;
				case 'mnu_command:Save EEPROM-Config':
					warn_eeprom_save();
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
		html_gauges+='<div id="gauge'+ i +'" style= "width: 100px; height: 80px"></div>'
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
    offtimeUI.slider = $(".w2ui-panel-content .scopeview #slider1")[0];
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
	document.getElementById('slider1').addEventListener("input", slider1);
	document.getElementById('slider2').addEventListener("input", slider2);
	document.getElementById('slider3').addEventListener("input", slider3);
	
	readTextFile('config.ini');
	
		
    ctx = document.getElementById("wavecanvas").getContext('2d');
	

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

});

// Allow multiple windows to be opened

