class btldr {
    constructor(write_cb, state_cb) {
        this.last_command=0x00;
        this.chip_id = '';
        this.silicon_rev = '';
        this.ldr_version = '';
        this.cyacd_file;
        this.cyacd_arr=[];
        this.cyacd_arr.array_id = [];
        this.cyacd_arr.row = [];
        this.cyacd_arr.size = [];
        this.cyacd_arr.data = [];
        this.cyacd_arr.byte = [];
        this.cyacd_arr.crc = [];
        this.cyacd_chip_id='';
        this.pc=0;
        this.time;
        this.info_cb=null;
        this.progress_cb=null;
		this.write=write_cb;
		this.state_cb=state_cb;
        this.byte_pos=0;
        this.chunk_size=32;
        this.receive_buffer=[];
    }

	read(data){
        let temp = new Uint8Array(data);
        
        for(let i=0;i<temp.length;i++){
           this.receive_buffer.push(temp[i]);
           if(this.receive_buffer.length>6 && temp[i] == 0x17){
               console.log(this.receive_buffer);
               	let buf = new Uint8Array(this.receive_buffer);
                switch(this.last_command){
                    case 0x38:
                        this.boot_decode_enter(buf);
                        console.log(this.chip_id);
                        break;
                    case 0x39:
                        if(buf[1]!=0) {
                            console.log('ERROR: Error at Row: ' + this.pc);
                        }else{
                            this.last_command=0x00;
                            this.time = setTimeout(() => this.protmr(), 5);
                        }
                        break;
                    case 0x37:
                        if(buf[1]!=0) {
                            console.log('ERROR: Error at Row: ' + this.pc);
                        }else{
                            this.last_command=0x00;
                            this.time = setTimeout(() => this.protmr(), 5);
                        }
                        break;
                }
                this.receive_buffer=[];
                this.last_command=0x00;      
           }
        }
	}
	
    connect(){
        this.receive_buffer=[];
        this.boot_cmd(0x38,[]);
    }


    set_progress_cb(cb_func){
        this.progress_cb=cb_func;
    }

    set_info_cb(cb_func){
        this.info_cb=cb_func;
    }

    cyacd(file){
        this.cyacd_file=file;
        let fs = new FileReader();
        fs.readAsText(file);
        fs.onload = (ev) => this.cyacd_loaded(ev);
    }

    
    programm(array, row, data){
        if(data.length==0) return;
        let buf = new Uint8Array(data.length+3);
        let cnt=3;
        buf[0] = array;
        buf[1] = row;
        buf[2] = row>>8;
        for(let i=0;i<data.length;i++){
            buf[cnt]=data[i];
            cnt++;
        }
        this.boot_cmd(0x39, buf);

    }

    send_info(str){
        if(this.info_cb==null) return;
        this.info_cb(str);
    }

    cyacd_loaded(ev){

        this.cyacd_file = ev.srcElement.result.split('\n');
        this.cyacd_chip_id = this.cyacd_file[0].substr(0,8);
        let cnt=0;
        this.send_info('INFO: Cyacd loaded, found chip-ID: ' + this.cyacd_chip_id);

        if(this.connected==false){
            this.send_info('INFO: Not connected to bootloader... exit');
            return;
        }
        console.log('ID: ' + this.chip_id);

        if(this.cyacd_chip_id==this.chip_id){
            this.send_info('INFO: Chip-ID matches, start programming of flash');
        }else{
            this.send_info('INFO: Chip-ID match failed... exit');
            return;
        }


        for(let i=1;i<this.cyacd_file.length;i++) {
            if(this.cyacd_file[i]!='') {
                this.cyacd_arr.array_id[cnt] = parseInt(this.cyacd_file[i].substr(1, 2), 16);
                this.cyacd_arr.row[cnt] = parseInt(this.cyacd_file[i].substr(3, 4), 16);
                this.cyacd_arr.size[cnt] = parseInt(this.cyacd_file[i].substr(7, 4), 16);
                this.cyacd_arr.data[cnt] = this.cyacd_file[i].substring(11, this.cyacd_file[i].length-3);
                this.cyacd_arr.crc[cnt] = parseInt(this.cyacd_file[i].substring(this.cyacd_file[i].length-3, this.cyacd_file[i].length-1),16);
                let byte_arr = new Uint8Array(this.cyacd_arr.size[cnt]);
                let cnt_byte=0;
                for(let w=0;w<this.cyacd_arr.data[cnt].length;w+=2){
                    byte_arr[cnt_byte] = parseInt(this.cyacd_arr.data[cnt].substr(w, 2), 16);
                    cnt_byte++;
                }
                this.cyacd_arr.byte[cnt] = byte_arr;

            }
            cnt++;
        }
        this.pc=0;
        //this.time = setInterval(() => this.protmr(), 100);
        this.protmr();
    }

    protmr(){
        let progress = [];
        if(this.last_command!=0x00 && this.pc != 0){
            //clearInterval(this.time);
            this.pc=0;
            this.send_info('\r\nERROR: Bootloader not responding');
            this.boot_cmd(0x3B,[]);
			this.state_cb('not responding');
            return;
        }

        if(this.pc==this.cyacd_arr.array_id.length){
            this.last_command=0x00;
            //clearInterval(this.time);
            this.pc=0;
            this.send_info('\r\nINFO: Programming done');
            this.boot_cmd(0x3B,[]);
			this.state_cb('finished');
            return;
        }
        let temp = this.cyacd_arr.byte[this.pc];
        progress.percent_done = Math.floor((100.0 / (this.cyacd_arr.array_id.length-1)) * this.pc);
        if(this.byte_pos<(temp.length-this.chunk_size)){
            let data = new Uint8Array(this.chunk_size);
            for(let i=0;i<this.chunk_size;i++){
                data[i] = temp[this.byte_pos];
                this.byte_pos++;
            }
            this.boot_cmd(0x37, data);
        }else{
            
            
            let len=this.cyacd_arr.byte[this.pc].length-this.byte_pos;
            let data = new Uint8Array(len);
            for(let i=0;i<len;i++){
               data[i] = temp[this.byte_pos];
               this.byte_pos++;
            }

            this.programm(this.cyacd_arr.array_id[this.pc], this.cyacd_arr.row[this.pc], data);
            this.byte_pos=0;
            this.pc++;
            this.progress_cb(progress);
        }
        

    }


    boot_cmd(command , data){
        if(this.connected == false){
            return
        }
        //let buffer = new Uint8Array(data.length+7);
		let buffer = new Array(data.length+7)
        let sum = 0;
        buffer[0] = 0x01;
        buffer[1] = command;
        buffer[2] = data.length & 0xFF;
        buffer[3] = (data.length>>>8) & 0xFF;
        let dat_cnt = 4;
        for(let i=0;i<data.length;i++){
            buffer[dat_cnt] = data[i];
            dat_cnt++;
        }
        let size = buffer.length-3;
        while (size > 0)
        {
            sum += buffer[size - 1];
            size--;
        }
        
        let crc = (1 + (~sum)) & 0xFFFF;
        buffer[dat_cnt] = crc & 0xFF;
        dat_cnt++;
        buffer[dat_cnt] = (crc >>> 8) &0xFF;
        dat_cnt++;
        buffer[dat_cnt] = 0x17;
        this.last_command=command;
		this.write(buffer);
        return;
    }

    boot_decode_enter(buffer){
        if(buffer.length!=15) return;
        this.chip_id = (buffer[4] | (buffer[5]<<8) | (buffer[6]<<16) | (buffer[7]<<24)).toString(16).toUpperCase();
        this.silicon_rev = buffer[8].toString(16).toUpperCase();
        this.ldr_version = buffer[10].toString(10) +'.' + buffer[9].toString(10);

        this.send_info('\r\nINFO: Connected to bootloader chip-id: ' + this.chip_id + ' silicon-rev: ' + this.silicon_rev + ' bootloader version: ' + this.ldr_version);
    }

}