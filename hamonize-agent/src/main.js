#!/usr/bin/env node


const path = require("path");
const request = require('request');
const fetch = require('node-fetch');
const fs = require('fs')

var log = require('./logger');
var http = require('http');
var https = require('https');
const Poller = require('./Poller');

var filePath = "/etc/hamonize/agent/";
var fileName = "agentJob.txt";
var schedule = require('node-schedule');
var uuidVal = getUUID();
var tenantVal = getTenant().trim();
var readline = require('readline');



var centerUrl = getCenterInfo();
var DEFAUT_POLLTIME = 10000; //10s


function myFunc(arg) {

	sysInfo();

	var backupData = backupFileData();
	log.info("myFuncBackupData---_" + backupData);
	if (backupData != "") {
		var chkCronJob = schedule.scheduledJobs;
		schedule.cancelJob('cobj.cronbackuponbackup');
		fnBackupJob(backupData);
		log.info("//==Cron Backup Job status is : " + schedule.scheduledJobs);

	}
}
// setTimeout(myFunc, 6000, 'funky');

function hamonizeVersion() {

	var exec = require('child_process').exec;
	exec('sudo sh /usr/share/hamonize-agent/shell/hamonizeVersionChk.sh  ', function (err, stdout, stderr) {
		log.info('//=====hamonizeVersion  : ' + stdout);
	});


}

//========================================================================
//== Agent Polling Time Settings =========================================
//========================================================================

/** Network Check  */
let networkChk = async function () {
	var ping = require('ping');
	var ip = require("ip");
	var ipAliveStatus = false;
	var hosts = ['google.com'];
	let res = "";
	for (let host of hosts) {
		res = await ping.promise.probe(host);

	}
	return res.alive
};



function getPollTime(uuid) {
	log.info("----getPollTime Func start----");

	var setUrl = "https://" + centerUrl + "/getAgent/setPollTime?uuid=" + uuid + "&&name=hamonize-agent";
	var retval = 0;

	networkChk().then(
		(value) => {
			if (value) {
				https.get(setUrl, (res) => {
					res.on('data', (data) => {
						console.log("data===============++" + data);
						var pollingObj = JSON.parse(data);

						if (pollingObj.data != 'nodata') {
							var pollingObj = JSON.parse(data);
							log.info("//====================================");
							log.info("//== Polling time has changed... " + pollingObj.data);
							log.info("//====================================");

							retval = pollingObj.data * 1000;
							log.info("//== Polling time has result... " + retval);
							Polling(retval);

						} else {
							Polling(DEFAUT_POLLTIME);
							log.info("//== Polling time doesn't changes..");
						}
					});
				});
			} else {
				log.info("network close~");
				retval = 10000;
				Polling(retval);
			}
		}
	);
}


function Polling(time) {
	let poller = new Poller();

	poller.onPoll(() => {
		log.info("//====agent polling start====");
		getPollTime(uuidVal);
		log.info("//==== polling time? ====" + time);

		networkChk().then(
			(value) => {
				console.log(value)
				if (value) {
					check_ufw();	//	방화벽 체크
					// hamonize stop 
				} else {
					log.info("network close~");
				}
			}

		);

	});

	// Initial start
	poller.poll(time);

}

// console.log("DEFAUT_POLLTIME : " + DEFAUT_POLLTIME)
//getPollTime(uuidVal);




//========================================================================
//== ip status check  Job=============================================================
//========================================================================
function ipStatusCheck() {
	var ping = require('ping');
	var ip = require("ip");
	var ipAliveStatus = false;
	var hosts = ['google.com'];

	hosts.forEach(function (host) {
		ping.sys.probe(host, function (isAlive) {
			var msg = isAlive ? 'host ' + host + ' is alive' : 'host ' + host + ' is dead';
			console.log("Internet ping check is : " + msg);
			ipAliveStatus = isAlive;
			console.log("Internet Check ipAlive Status True/false :: " + ipAliveStatus);

			if (!ipAliveStatus) {
				var exec = require('child_process').exec;
				exec('sudo sh /usr/share/hamonize-agent/shell/route_add_default_gw.sh  ', function (err, stdout, stderr) {
					log.info('//===== route add default gw stdout: ' + stdout);
					log.info('//=====route add default gw stderr: ' + stderr);

					if (err !== null) {
						log.info('//== ipAliveStatus error: ' + err);
					}
				});
			}

		});
	});
}


//========================================================================
//== Firewall Job=============================================================
//========================================================================-
function getFirewallDataCall(uuid) {
	//	Firewall 정책 정보 조회 
	var setUrl = "https://" + centerUrl + "/getAgent/firewall?name=" + uuid;
	log.info("Firewall 정책 정보 조회" + setUrl);


	https.get(setUrl, (res) => {
		// log.info('//==statusCode is :', res.statusCode);

		res.on('data', (data) => {
			log.info("//== Firewall 정책 data is :: " + data);
			if (data != 'nodata') {

				var updtFirewallObj = JSON.parse(data);
				log.info("//====================================");
				log.info("//==FirewallObj Data is : " + JSON.stringify(updtFirewallObj));
				log.info("//====================================");

				var fileDir = "/etc/hamonize/firewall/firewallInfo.hm";
				let content = JSON.stringify(updtFirewallObj);
				fs.writeFile(fileDir, content, (err) => {
					if (err) {
						log.info("//== getFirewallDataCall() error  " + err.message)
					}
					fnFirewallJob(content);
				});
			} else {
				log.info("//== Firewall 정책 didn't working");
			}
		});
	}).on('error', (e) => {
		log.info(e);
	});
}


//========================================================================
//== Recovery Job=============================================================
//========================================================================
function getRecoveryDataCall(uuid) {
	//	Recovery 정책 정보 조회
	var setUrl = "https://" + centerUrl + "/getAgent/recov?name=" + uuid;
	log.info("Recovery 정책 정보 조회" + setUrl);

	https.get(setUrl, (res) => {
		res.on('data', (data) => {
			log.info("//== Recovery 정책 data is : " + data);
			if (data != "nodata" && data != "{}") {
				var updtRecovObj = JSON.parse(data);

				log.info("//====================================");
				log.info("//== Recovery 정책 ::RecovObj Data is : " + JSON.stringify(updtRecovObj));
				log.info("//== Recovery 정책 ::RecovObj.PATH Data is : " + JSON.stringify(updtRecovObj.PATH));
				log.info("//== Recovery 정책 ::RecovObj.NAME Data is : " + JSON.stringify(updtRecovObj.NAME));
				log.info("//====================================");


				var fileDir = "/etc/hamonize/recovery/recoveryInfo.hm";
				let content = updtRecovObj.NAME;
				fs.writeFile(fileDir, content, (err) => {
					if (err) {
						log.info("//Recovery 정책 :: error  " + err.message)
					} else {
						fnRecovJob(content);
					}
				});
			} else {
				log.info("//== Recovery 정책 not working")
			}


		});
	}).on('error', (e) => {
		log.info(e);
	});
}


//========================================================================
//== Updt Job=============================================================
//========================================================================
function getUpdtDataCall(uuid) {
	//	Updt 정책 정보 조회

	var setUrl = "https://" + centerUrl + "/getAgent/updt?name=" + uuid;
	log.info("updt 정책 정보 조회" + setUrl);
	https.get(setUrl, (res) => {
		res.on('data', (data) => {
			log.info("//== updt 정책 data is :: " + data);
			if (data != 'nodata') {
				var fileDir = "/etc/hamonize/updt/updtInfo.hm";
				let content = data;
				fs.writeFile(fileDir, content, (err) => {
					if (err) {
						log.info("//==u pdt 정책:: getUpdtDataCall() error  " + err.message)
					}
					fnUpdtJob(content);
				});

			} else {
				log.info('//== updt 정책 did not working')
			}
		});
	}).on('error', (e) => {
		log.info(e);
	});
}

function fnUpdtJob(retData) {

	var updtDataObj = JSON.parse(retData);
	log.info("//== updt 정책 ::updtDataObj Data is : " + JSON.stringify(updtDataObj));
	log.info("//== updt 정책 ::updtDataObj.Ins Data is : " + JSON.stringify(updtDataObj.INS));
	log.info("//== updt 정책 ::updtDataObj.ups Data is : " + JSON.stringify(updtDataObj.UPS));

	//정책정보 파일로 저장
	outputData = updtFileData();
	log.info("//== updt 정책정보 파일 Data is : " + outputData);

	var exec = require('child_process').exec;
	exec(" sudo sh /usr/share/hamonize-agent/shell/updtjob.sh", function (err, stdout, stderr) {
		log.info('updt 정책 ::  stdout: ' + stdout);
		log.info('updt 정책 :: stderr: ' + stderr);

		if (err !== null) {
			log.info(' updt 정책 ::  error: ' + err);
		}
	});

}



//========================================================================
//== Nxss Job=============================================================
//========================================================================
function getNxssDataCall(uuid) {

	//	Nxss 정책 정보 조회
	var setUrl = "https://" + centerUrl + "/getAgent/nxss?name=" + uuid;
	console.log("Nxss Job : " + setUrl)
	https.get(setUrl, (res) => {
		let data = '';
		res.on('data', (chunk) => {
			data += chunk;
		});
		res.on('end', () => {
			log.info("//== Nxss data is : " + data);
			if (data != 'nodata') {
				fnNxssJob(data);
			}
		});
	}).on('error', (e) => {
		log.info(e);
	});
}

function sendNxssResultToCenter(fileDate, gubun) {

	log.info("fileDate------------" + fileDate + "==" + gubun);
	var os = require("os");
	var hostname = os.hostname();

	request.post('https://' + centerUrl + '/act/nxssAct', {
		json: {
			events: [{
				hostname: hostname,
				uuid: uuidVal,
				file_gubun: gubun,
				fileDate: fileDate
			}]
		}
	}, (error, res, body) => {
		if (error) {
			console.error(error)
			return
		}
		console.log(`statusCode: ${res.statusCode}`)
		console.log(body)
	})

}

function fnNxssJob(retData) {

	log.info("==== fnNxssJob ====");
	var nxssDataObj = JSON.stringify(retData);
	log.info("//==nxssDataObj.nxssList Data is : " + JSON.stringify(nxssDataObj.nxssList) + "\n");
	log.info("//==nxssDataObj.nxssList Data count is : " + JSON.stringify(nxssDataObj.nxssListCnt));

	log.info("//==nxssDataObj.fording Data is : " + JSON.stringify(nxssDataObj.fording));
	log.info("//==nxssDataObj.message Data is : " + JSON.stringify(nxssDataObj.message));
	log.info("//====================================");

	if (typeof nxssDataObj.nxssList != 'undefined') {
		var nxssData = nxssDataObj.nxssList;
		var arrNxssData = nxssData.split(",");
		var nxssDataCnt = nxssDataObj.nxssListCnt;

		var fileDir = "/etc/hamonize/siteblock/illegalUrls.ini";
		let content = arrNxssData[0];

		// 새로운 값이 들어오면 illegalUrls에 추가
		fs.writeFile(fileDir, content, (err) => {
			if (err) {
				log.info("//== nxssData Fn () error  " + err.message)
			}
		});


		var exec = require('child_process').exec;
		const execSiteblockFileDate = function (cb) {
			exec("ls -al /etc/hamonize/siteblock/illegalUrls.ini  | awk '{print $6$7\"_\"$8}'", (err, stdout, stderr) => {
				if (err) {
					console.error(`exec error: ${err}`);
					return cb(err);
				}
				cb(null, {
					stdout,
					stderr
				});
			});

		};
		execSiteblockFileDate(function (err, {
			stdout,
			stderr
		}) {
			sendNxssResultToCenter(stdout, "filelist");
		});

	}

	if (typeof nxssDataObj.fording != 'undefined') {

		var nxssData = nxssDataObj.fording;
		var nxssM = nxssDataObj.message;
		var arrNxssData = nxssData.split(",");
		var fileDir = "/etc/hamonize/siteblock/siteblock.ini";
		let content = "";
		content += "[SiteBlock]\n";
		content += "enable=true\n";
		content += "warningmsg=" + nxssM + "\n";
		content += "warningurl=" + arrNxssData[0] + "";

		console.log("======= content =======" + content + "\n")
		fs.writeFile(fileDir, content, (err) => {
			if (err) {
				log.info("//== nxssData Fn () error  " + err.message)
			}
		});

		var exec = require('child_process').exec;
		const execSiteblockFileDate = function (cb) {
			exec("ls -al /etc/hamonize/siteblock/siteblock.ini  | awk '{print $6$7\"_\"$8}'", (err, stdout, stderr) => {
				if (err) {
					console.error(`exec error: ${err}`);
					return cb(err);
				}
				cb(null, {
					stdout,
					stderr
				});
			});

		};
		execSiteblockFileDate(function (err, {
			stdout,
			stderr
		}) {
			sendNxssResultToCenter(stdout, "fording");
		});

	}


}

//========================================================================
//== Device Job=============================================================
//========================================================================
function getDeviceDataCall(uuid) {
	//	device 정책 정보 조회
	var setUrl = "https://" + centerUrl + "/getAgent/device?name=" + uuid;
	log.info("device 정책 정보 조회" + setUrl);

	https.get(setUrl, (res) => {
		res.on('data', (data) => {
			log.info("//== device 정책 data is :: " + data);

			if (data != 'nodata') {
				var fileDir = "/etc/hamonize/security/device.hm";
				let content = data;
				const fs = require('fs')

				fs.writeFile(fileDir, content, (err) => {
					if (err) {
						log.info("//== device 정책 getDeviceDataCall() error  " + err.message)
					}
					fnDeviceJob(content);
				});
			} else {
				// 변경된 디바이스 정책이 없는 경우 device.hm 파일 수정 x 
				log.info("//== device 정책 didn't working");
			}
		});
	}).on('error', (e) => {
		log.info(e);
	});
}



function sendToCenter_unauth() {

	log.info("--- sendToCenter_unauth start----");

	if (fs.existsSync('/etc/hamonize/usblog/usb-unauth.hm')) {
		var events_str = fs.readFileSync('/etc/hamonize/usblog/usb-unauth.hm', 'utf8');

		events_str = events_str.replace(/'/g, '\"');
		events_str = events_str.replace(/\n/g, ',').slice(0, -1);

		var data = '{"events": [ ' + events_str + ' ]}';
		console.log("data==== : " + data);
		var events = JSON.parse(data);


		request.post('https://' + centerUrl + '/hmsvc/unauth', {
			json: events
		}, (error, res, body) => {
			if (error) {
				console.error(error);
				//return
			}
			console.log(`statusCode: ${res.statusCode}`);
			console.log(body);
		})
		fs.unlinkSync('/etc/hamonize/usblog/usb-unauth.hm');
	}

}


async function usbUnauthProc(filename) {

	const usbUnauthProcVal = await aWaitGetUsbLogFile(filename);
	let eventsData = {
		events: [
			usbUnauthProcVal
		]
	};

	console.log(eventsData);

	request.post('https://' + centerUrl + '/hmsvc/unauth', {
		json: {
			eventsData
		}
	}, (error, res, body) => {

		console.log("res---" + JSON.stringify(res));
		console.log(body)
		if (error) {
			console.error(error)
			return
		}
		console.log(`statusCode: ${res.statusCode}`)

	})

}

function aWaitGetUsbLogFile(filename) {
	const exec = require('child_process').exec;
	return new Promise((resolve, reject) => {
		let usbLogData = "";
		const lineReader = require('line-reader');
		lineReader.eachLine(filename, (line, last) => {

			if (!last) {
				usbLogData += line + ",";
			} else {
				usbLogData += line;
				resolve(usbLogData);
			}

		});
	});
}


function sendUsbUnauth() {
	var filename = '/etc/hamonize/usblog/usb-unauth.hm';
	usbUnauthProc(filename);
}


//========================================================================
//== Progrm Job=============================================================
//========================================================================

function getProgrmDataCall(uuid) {
	//	progrm 정책 정보 조회
	var setUrl = "https://" + centerUrl + "/getAgent/progrm?name=" + uuid;
	log.info("progrm 정책 정보 조회" + setUrl);
	var os = require("os");
	var hostname = os.hostname();
	var datetime = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

	https.get(setUrl, (res) => {
		res.on('data', (data) => {
			log.info("//== progrm 정책 data is :: " + data);
			if (data != 'nodata') {
				var fileDir = "/etc/hamonize/progrm/progrm.hm";
				let content = '';

				if (data == 'DATAINIT') {
					var DataObj = '';
				} else {
					content = data;
					var DataObj = JSON.stringify(JSON.parse(data).INS);
				}
				var text = fs.readFileSync(fileDir, 'utf8');
				var arr = text.replace('{"INS":', '').replace('}', '').replace('"', '').replace('"', '').split(',');
				var delarr = [];
				for (i in arr) {
					if (!DataObj.includes(arr[i])) {
						delarr.push(arr[i]);
					}
				}

				fs.writeFile(fileDir, content, (err) => {
					if (err) {
						log.info("//==progrm 정책 error  " + err.message)
					}
					if (data != 'DATAINIT') {
						fnProgrmJob(content);
					}
				});

				var sendarr = [];
				for (i in delarr) {
					sendarr.push({
						progrmname: delarr[i],
						status_yn: "N",
						status: "del",
						datetime: datetime,
						hostname: hostname,
						uuid: uuid,
					});
				}

				var send_data = JSON.stringify(sendarr);
				if (typeof send_data !== 'undefined' && send_data.length > 0) {
					var send_parsed = JSON.parse(send_data);

					var unirest = require('unirest');
					unirest.post('http://' + centerUrl + '/act/progrmAct')
						.header({
							'User-Agent': 'HamoniKR OS',
							'content-type': 'application/json'
						})
						.send({
							insresert: send_parsed
						})
						.end(function (response) {
							console.log("response.body===" + JSON.stringify(response));
						});
				}
			} else {
				log.info("//== progrm 정책 didn't working");
			}
		});
	}).on('error', (e) => {
		log.info(e);
	});
}


//========================================================================
//== Backup Job=============================================================
//========================================================================

function getBackupDataCall(uuid) {

	var setUrl = "https://" + centerUrl + "/getAgent/backup?name=" + uuid;
	log.info("Backup 정책 정보 조회" + setUrl);
	https.get(setUrl, (res) => {
		res.on('data', (data) => {
			log.info("//== Backup 정책 Backup data is :: " + data);
			if (data != 'nodata') {
				var fileDir = "/etc/hamonize/backup/backupInfo.hm";
				let content = data;
				fs.writeFile(fileDir, content, (err) => {
					if (err) {
						log.info("//==Backup 정책 :: error  " + err.message)
					}
					fnBackupJob(content);
				});
			}
		});
	}).on('error', (e) => {
		log.info(e);
	});
}

function fnBackupJob(retData) {

	//	 데이터 sample
	// 주별	//{"backup":[{"cycle_time":"21:30","cycle_option":"mon,tue","Bac_gubun":"D"}]}
	// 일		
	// retData='{"backup":[{"cycle_time":"01:30","cycle_option":"","Bac_gubun":"E"}]}';
	// 월		//{"backup":[{"cycle_time":"21:30","cycle_option":"2019\/06\/12","Bac_gubun":"M"}]} 

	if (retData == "nodata") {
		return false;
	}
	var backupDataObj = JSON.parse(retData);
	var backup_time = backupDataObj.backup[0].cycle_time; // 시간
	var backup_cycle = backupDataObj.backup[0].cycle_option; // 주기
	var backup_gubun = backupDataObj.backup[0].Bac_gubun;

	log.info("//==Backup 정책 ::backup_time is " + backup_time);
	log.info("//==Backup 정책 ::backup_cycle is " + backup_cycle);
	log.info("//==Backup 정책 ::backup_gubun is " + backup_gubun);
	var hours = 0,
		minutes = 0;

	hours = backup_time.split(":")[0];
	minutes = backup_time.split(":")[1];

	log.info("//==Backup 정책 :: hours is " + hours + "//===minutes is " + minutes + "//backup_gubun===" + backup_gubun);


	//	node crontab
	//[Seconds: 0-59], [Minutes: 0-59], [Hours: 0-23], 
	//[Day of Month: 1-31], [Months: 0-11 (Jan-Dec)], [Day of Week: 0-6 (Sun-Sat)]

	// //	주별
	if (backup_gubun == 'D') {
		schedule.cancelJob('cronbackup');
		const scheduler = schedule.scheduleJob('cronbackup', '01 ' + minutes + ' ' + hours + ' * * ' + backup_cycle,
			function () {
				log.info('//==Backup 정책(주별) ::===backup cycle all day of week : ' + hours + "/" + minutes + "==" + backup_cycle);
				var exec = require('child_process').exec;
				exec('sudo sh /usr/share/hamonize-agent/shell/backupJob.sh  ', function (err, stdout, stderr) {
					log.info('//==Backup 정책(주별) ::===backup cycle all day of week stdout: ' + stdout);
					log.info('//==Backup 정책(주별) ::===backup cycle all day of week stderr: ' + stderr);

					if (err !== null) {
						log.info('//==Backup 정책(주별) :: backup_gubun week error: ' + err);
					}
				});
			});
	}
	// //	일별
	if (backup_gubun == 'E') {
		schedule.cancelJob('cronbackup');
		const scheduler = schedule.scheduleJob('cronbackup', '01 ' + minutes + ' ' + hours + ' * * *', function () {
			log.info('//==Backup 정책(일별) ::===backup cycle all day : ' + hours + "/" + minutes + "==" + backup_cycle);
			var exec = require('child_process').exec;

			exec(' sudo sh /usr/share/hamonize-agent/shell/backupJob.sh  ', function (err, stdout, stderr) {

				log.info('//==Backup 정책(일별) ::===backup cycle all daystdout: ' + stdout);
				log.info('//==Backup 정책(일별) ::===backup cycle all daystderr: ' + stderr);

				if (err !== null) {
					log.info('//==Backup 정책 ::===backup cycle all dayerror: ' + err);
				}
			});
		});
	}

	// //	월별
	if (backup_gubun == 'M') {
		var month = backup_cycle.split("/")[1];
		var day = backup_cycle.split("/")[2];
		schedule.cancelJob('cronbackup');

		const scheduler = schedule.scheduleJob('cronbackup', '01 ' + minutes + ' ' + hours + ' ' + day + ' *  *',

			function () {
				log.info('//==Backup 정책(월별) ::===backup cycle all month : ' + hours + "/" + minutes + "//====month is : " + month + ", day : " + day);
				var exec = require('child_process').exec;
				exec('sudo sh /usr/share/hamonize-agent/shell/backupJob.sh  ', function (err, stdout, stderr) {
					log.info('//==Backup 정책(월별) ::===backup cycle all monthstdout: ' + stdout);
					log.info('//==Backup 정책(월별) ::===backup cycle all monthstderr: ' + stderr);

					if (err !== null) {
						log.info('//==Backup 정책(월별)::===backup cycle all montherror: ' + err);
					}
				});
			});
	}

}


function backupFileData() {
	var output = "";
	var stats = fs.statSync("/etc/hamonize/backup/backupInfo.hm");
	log.info("//==백업 정책 파일 체크 " + stats.isFile());


	if (stats.isFile()) {
		var text = fs.readFileSync('/etc/hamonize/backup/backupInfo.hm', 'utf8');
		log.info("//==백업 정책 데이터 : " + text);
		output = text;
	}
	return output;
}



//========================================================================
//== Common Job=============================================================
//========================================================================


function getCenterInfo() {
	var retval = "";
	var array = fs.readFileSync('/etc/hamonize/propertiesJob/propertiesInfo.hm').toString().split("\n");
	for (i in array) {
		if (array[i].indexOf("CENTERURL") != -1) {
			var centerData = array[i].split("=");
			retval = centerData[1];
			// }else{
			// console.log("2---" + array[i]);
		}
	}
	return retval;
}


// 컴퓨터 UUID
function getUUID() {
	var text = fs.readFileSync('/etc/hamonize/uuid', 'utf8');
	log.info("//== pc uuid is : " + text);
	return text;
}


// 테넌트 고유값
function getTenant() {
	var text = fs.readFileSync('/etc/hamonize/hamonize_tanent', 'utf8');
	log.info("//== pc uuid is : " + text);
	return text;
}

// hw 변경로그 체크 파일
function getHwpInfo(filename) {
	var text = fs.readFileSync('/etc/hamonize/hwinfo/' + filename, 'utf8');
	log.info("//== pc hw ifon is : " + text);
	return text;
}


function FnMkdir() {
	FnProgrmMkdir();
	FnSiteBlockMkdir();
	FnBackupMkdir();
	FnUpdtMkdir();
	FnSecurityMkdir();
	FnFirewallMkdir();
	FnRecoveryMkdir();
	FnHwInfoMkdir();
}



function FnHwInfoMkdir() {

	log.info("FnHwInfoMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/hwinfo").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");
			var exec = require('child_process').exec;
			exec(" sudo mkdir /etc/hamonize/hwinfo/ && sudo touch /etc/hamonize/hwinfo/hwinfo.hm ",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}


function FnProgrmMkdir() {

	try {
		fs.lstatSync("/etc/hamonize/progrm").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" sudo mkdir /etc/hamonize/progrm/ && sudo touch /etc/hamonize/progrm/progrm.hm ",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}


function FnSiteBlockMkdir() {

	log.info("FnSiteBlockMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/siteblock").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" " +
				" sudo mkdir /etc/hamonize/siteblock/ && sudo touch /etc/hamonize/siteblock/siteblock.ini && sudo touch /etc/hamonize/siteblock/illegalUrls.ini ",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}

function FnBackupMkdir() {

	log.info("FnBackupMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/backup").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" " +
				" sudo mkdir /etc/hamonize/backup/ && sudo touch /etc/hamonize/backup/backupInfo.hm ",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}

function FnUpdtMkdir() {

	log.info("FnUpdtMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/updt").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" " +
				" sudo mkdir /etc/hamonize/updt/ && sudo  touch /etc/hamonize/updt/updtInfo.hm ",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}

function FnSecurityMkdir() {

	log.info("FnSecurityMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/security").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" " +
				" sudo mkdir /etc/hamonize/security/ && sudo  touch /etc/hamonize/security/device.hm ",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}

function FnFirewallMkdir() {

	log.info("FnFirewallMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/firewall").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" " +
				" sudo mkdir /etc/hamonize/firewall/ && sudo  touch /etc/hamonize/firewall/firewallInfo.hm",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}


function FnRecoveryMkdir() {

	log.info("FnRecoveryMkdir----");
	try {
		fs.lstatSync("/etc/hamonize/recovery").isDirectory();
	} catch (e) {
		// Handle error
		if (e.code == 'ENOENT') {
			log.info("//==mkdir directory");

			var exec = require('child_process').exec;
			exec(" " +
				" sudo mkdir /etc/hamonize/recovery/ && sudo  touch /etc/hamonize/recovery/recoveryInfo.hm  && touch /var/log/hamonize/agentjob/agentjob_backup_recovery.log",
				function (err, stdout, stderr) {
					log.info('//==stdout: ' + stdout);
					log.info('//==stderr: ' + stderr);
					if (err !== null) {
						log.info('//== mkdir error: ' + err);
					}
				});
		}
	}
}



function execShellCommand(cmd) {
	const exec = require('child_process').exec;
	return new Promise((resolve, reject) => {
		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				console.warn(error);
			}
			resolve(stdout ? stdout : stderr);
		});
	});
}



function os_func() {
	this.execCommand = function (cmd) {
		return new Promise((resolve, reject) => {
			var exec = require('child_process').exec;
			exec(cmd, (error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout)
			});
		})
	}
}

// UFW Check ============================
const check_ufw = async () => {
	try {

		// 필수 포트 : 11100, 22
		// 20	tcp	ftp-data
		// 21	tcp	ftp server
		// 22	tcp	ssh server
		// 23	tcp	telnet server
		// 25	tcp	email server
		// 53	tcp/udp	Domain name server
		// 69	udp	tftp server
		// 80	tcp	HTTP server
		// 110	tcp/udp	POP3 server
		// 123	tcp/udp	NTP server
		// 443	tcp	HTTPS server

		const portlist = ["11100", "11300", "11400", "11200", "22", "2202"];
		const reloadPort = new Array();
		for (let i = 0; i < portlist.length; i++) {

			let ufwStatusVal = await execShellCommand("ufw status |grep ALLOW | grep -w \""+portlist[i]+"\" | wc -l");
			console.log(ufwStatusVal);

			// if (ufwStatusVal.indexOf(portlist[i]) < 0) {
			if( ufwStatusVal == 0 ){
				console.log("portlist[i]==========++" + portlist[i]);
				reloadPort.push(portlist[i]);
			}
		}

		for (let i = 0; i < reloadPort.length; i++) {
			let loadPort = reloadPort[i];
			let p = await execShellCommand(`ufw allow ${loadPort}`);
		}

		await execShellCommand('nscd -i passwd && nscd -i hosts');

	} catch (err) {
		return Object.assign(err);
	}
}

// #----------------------------------------------------------------------------#
// Hamonize Check Expiry
// #----------------------------------------------------------------------------#
const check_expiry = async () => {
	var exec = require('child_process').exec;


	var setUrl = "https://" + centerUrl + "/hmsvc/isitpossible";
	log.info("check_expiry 조회" + setUrl);
	// return status code : Agent -> (Y-사용가능, E-기간만료), Connector ->( N-설치개수 제한 )
	var unirest = require('unirest');
	unirest.post(setUrl)
		.header('content-type', 'application/json')
		.send({
			events: [{
				domain: tenantVal
			}]
		})
		.end(function (response) {
			// console.log("response.body==="+JSON.stringify(response));
			console.log("\nbbbresponse.body===" + response.body);


			const dataVal = response.body;
			if (dataVal == 'E') {
				// Stop Hamonize Modules - 사용기간이 만료되어 서비스 중지를 시킨다. 
					exec('sudo /usr/share/hamonize-agent/shell/hamonizeExpiry.sh 0 ', function (err, stdout, stderr) {
					if (err !== null) {
						log.info('//== fnStopHamonize error: ' + err);
					}
				});
			} else if (dataVal == 'Y') {	// 사용기간 만료 > 사용 기간 연장 
				const getExpirtFileValue = getExpirtFile('hamonize.expiry');
				console.log("getExpirtFileValue===" + getExpirtFileValue + "==");
				if (getExpirtFileValue == 'N') {
					console.log("aaaaaaaaaaaaaa");
					exec('sudo /usr/share/hamonize-agent/shell/hamonizeExpiry.sh 1 ', function (err, stdout, stderr) {
						if (err !== null) {
							log.info('//== fnStopHamonize error: ' + err);
						}
					});
				}
			} else if (dataVal == 'N') {
				exec('sudo /usr/share/hamonize-agent/shell/hamonizeExpiry.sh 2 ', function (err, stdout, stderr) {
					if (err !== null) {
						log.info('//== fnStopHamonize error: ' + err);
					}
				});
			}

		});


	// https.get(setUrl, (res) => {
	// 	res.on('data', (data) => {
	// 		log.info("//== hamonize expiry is :: " + data);

	// 		data = 'E';

	// 		if (data == 'E') {
	// 			// Stop Hamonize Modules - 사용기간이 만료되어 서비스 중지를 시킨다. 
	// 			exec('sudo sh /home/gon/git/hamonize/hamonize-agent/src/shell/hamonizeExpiry.sh 0 ', function (err, stdout, stderr) {
	// 				// exec('sudo sh /usr/share/hamonize-agent/shell/hamonizeExpiry.sh 0 ', function (err, stdout, stderr) {
	// 				if (err !== null) {
	// 					log.info('//== fnStopHamonize error: ' + err);
	// 				}
	// 			});
	// 		} else if (data == 'Y') {	// 사용기간 만료 > 사용 기간 연장 

	// 			const abc = aaa('hamonize.expiry');
	// 			console.log("abc===" + abc);
	// 			if (abc == 'N') {
	// 				exec('sudo sh /home/gon/git/hamonize/hamonize-agent/src/shell/hamonizeExpiry.sh 1 ', function (err, stdout, stderr) {
	// 					// exec('sudo sh /usr/share/hamonize-agent/shell/hamonizeExpiry.sh 1 ', function (err, stdout, stderr) {
	// 					if (err !== null) {
	// 						log.info('//== fnStopHamonize error: ' + err);
	// 					}
	// 				});
	// 			}
	// 		} else if (data == 'N') {
	// 			exec('sudo sh /home/gon/git/hamonize/hamonize-agent/src/shell/hamonizeExpiry.sh 2 ', function (err, stdout, stderr) {
	// 				// exec('sudo sh /usr/share/hamonize-agent/shell/hamonizeExpiry.sh 2 ', function (err, stdout, stderr) {
	// 				if (err !== null) {
	// 					log.info('//== fnStopHamonize error: ' + err);
	// 				}
	// 			});
	// 		}
	// 	});
	// }).on('error', (e) => {
	// 	log.info(e);
	// });
}



// hw 변경로그 체크 파일
function getExpirtFile(filename) {
	var text = '';

	if (fs.existsSync('/etc/hamonize/' + filename)) {
		text = fs.readFileSync('/etc/hamonize/' + filename, 'utf8');
	}
	return text.trim();
}

// HW chk =====================================
const sysInfo = async () => {
	let retData = {}
	log.info("sysInfo.... ");

	//		await execSetHostname(pcnum)

	const si = require('systeminformation');

	const cpu = await si.cpu(); // CPU Info

	let cpuinfo = ` ${cpu.manufacturer} ${cpu.brand} ${cpu.speed}GHz`;
	cpuinfo += ` ${cpu.cores} (${cpu.physicalCores} Physical)`;

	let cpuinfoMd5 = ` ${cpu.manufacturer} ${cpu.brand}`;
	cpuinfoMd5 += ` ${cpu.cores} (${cpu.physicalCores} Physical)`;

	const disk = (await si.diskLayout())[0]; // Disk Info
	const size = Math.round(disk.size / 1024 / 1024 / 1024);
	let diskInfo = ` ${disk.vendor} ${disk.name} ${size}GB ${disk.type} (${disk.interfaceType})`;
	let diskSerialNum = disk.serialNum;

	const os = await si.osInfo(); //OS Info
	let osinfo = ` ${os.distro} ${os.release} ${os.codename} (${os.platform})`;

	let osinfoKernel = ` ${os.kernel} ${os.arch}`;

	const ram = await si.mem(); // RAM Info
	const totalRam = Math.round(ram.total / 1024 / 1024 / 1024);
	let raminfo = ` ${totalRam}GB`;

	const ipinfo = require("ip"); //	get os ip address
	const pcuuid = (await si.uuid()); //	 get os mac address 

	const machineIdSync = require('node-machine-id').machineIdSync;
	let machindid = machineIdSync({
		original: true
	});




	const { networkInterfaces } = require('os');

	const nets = networkInterfaces();
	const results = Object.create(null); // Or just '{}', an empty object

	for (const name of Object.keys(nets)) {
		for (const net of nets[name]) {
			// Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
			if (!net.internal) {
				// if (net.family === 'IPv4' && !net.internal) {
				if (!results[name]) {
					results[name] = [];
				}
				results[name].push(net.address);
			}

		}
	}

	let vpnInfo = '';
	if (typeof results['tun0'] != 'undefined') {
		vpnInfo = results['tun0'][0];
	}



	const pcHostname = await execShellCommand('hostname');
	const cpuid = await execShellCommand('dmidecode -t 4|grep ID');
	const usernm = await execShellCommand('users');

	let md5 = require('md5');
	// let hwinfoMD5 = pcHostname + cpuinfoMd5 + diskInfo + diskSerialNum + osinfoKernel + raminfo + machindid;
	let hwinfoMD5 = pcHostname + ipinfo.address() + cpuinfoMd5 + diskInfo + diskSerialNum + osinfoKernel + raminfo + machindid + "===";
	// let hwinfoMD5 = pcHostname + ipinfo.address() + cpuinfoMd5 + diskInfo + diskSerialNum + osinfoKernel + raminfo + machindid;
	let hwData = md5(hwinfoMD5);

	const base_hwinfo = getHwpInfo("hwinfo.hm");

	console.log("hwData.trim()=====" + hwData.trim());
	console.log("base_hwinfo.trim()=========++" + base_hwinfo.trim());
	let isSendYn = false;
	if (hwData.trim() == base_hwinfo.trim()) {

		isSendYn = false;
	} else {
		isSendYn = true;
		let fileDir = "/etc/hamonize/hwinfo/hwinfo.hm";
		fs.writeFile(fileDir, hwData, (err) => {
			if (err) {
				log.info("//== sysInfo hw check() error  " + err.message)
			}
		});
	}

	if (isSendYn) {

		var unirest = require('unirest');
		unirest.post('https://' + centerUrl + '/hmsvc/eqhw')
			.header('content-type', 'application/json')
			.send({
				events: [{
					datetime: 'datetime',
					hostname: pcHostname,
					memory: raminfo,
					cpuid: cpuid,
					hddinfo: diskInfo,
					hddid: diskSerialNum,
					ipaddr: ipinfo.address(),
					vpnip: vpnInfo,
					uuid: machindid,
					user: usernm,
					macaddr: pcuuid.macs[0],
					cpuinfo: cpuinfo,
					domain: tenantVal
				}]
			})
			.end(function (response) {
				// console.log("response.body==="+JSON.stringify(response));
				console.log("\nbbbresponse.body===" + response.body);
			});
		log.info("telegraf restart");
		// await execShellCommand('service telegraf restart');
	}


}


// HW chk =====================================
const sysInfo2 = async () => {
	let retData = {}
	log.info("sysInfo.... ");

	//		await execSetHostname(pcnum)

	const si = require('systeminformation');

	const cpu = await si.cpu(); // CPU Info

	let cpuinfo = ` ${cpu.manufacturer} ${cpu.brand} ${cpu.speed}GHz`;
	cpuinfo += ` ${cpu.cores} (${cpu.physicalCores} Physical)`;

	let cpuinfoMd5 = ` ${cpu.manufacturer} ${cpu.brand}`;
	cpuinfoMd5 += ` ${cpu.cores} (${cpu.physicalCores} Physical)`;

	const disk = (await si.diskLayout())[0]; // Disk Info
	const size = Math.round(disk.size / 1024 / 1024 / 1024);
	let diskInfo = ` ${disk.vendor} ${disk.name} ${size}GB ${disk.type} (${disk.interfaceType})`;
	let diskSerialNum = disk.serialNum;

	const os = await si.osInfo(); //OS Info
	let osinfo = ` ${os.distro} ${os.release} ${os.codename} (${os.platform})`;

	let osinfoKernel = ` ${os.kernel} ${os.arch}`;

	const ram = await si.mem(); // RAM Info
	const totalRam = Math.round(ram.total / 1024 / 1024 / 1024);
	let raminfo = ` ${totalRam}GB`;

	const ipinfo = require("ip"); //	get os ip address
	const pcuuid = (await si.uuid()); //	 get os mac address 

	const machineIdSync = require('node-machine-id').machineIdSync;
	let machindid = machineIdSync({
		original: true
	});




	const { networkInterfaces } = require('os');

	const nets = networkInterfaces();
	const results = Object.create(null); // Or just '{}', an empty object

	for (const name of Object.keys(nets)) {
		for (const net of nets[name]) {
			// Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
			if (!net.internal) {
				// if (net.family === 'IPv4' && !net.internal) {
				if (!results[name]) {
					results[name] = [];
				}
				results[name].push(net.address);
			}

		}
	}

	let vpnInfo = '';
	if (typeof results['tun0'] != 'undefined') {
		console.log(results['tun0']);  // result ::: [ '10.8.0.2', 'fe80::87f5:686f:a23:1002' ]
		vpnInfo = results['tun0'][0];
	}



	const pcHostname = await execShellCommand('hostname');
	const cpuid = await execShellCommand('dmidecode -t 4|grep ID');
	const usernm = await execShellCommand('users');

	let md5 = require('md5');
	// let hwinfoMD5 = pcHostname + cpuinfoMd5 + diskInfo + diskSerialNum + osinfoKernel + raminfo + machindid;
	let hwinfoMD5 = pcHostname + ipinfo.address() + cpuinfoMd5 + diskInfo + diskSerialNum + osinfoKernel + raminfo + machindid;
	let hwData = md5(hwinfoMD5);

	const base_hwinfo = getHwpInfo("hwinfo.hm");

	console.log("hwData.trim()=====" + hwData.trim());
	console.log("base_hwinfo.trim()=========++" + base_hwinfo.trim());
	let isSendYn = false;
	if (hwData.trim() == base_hwinfo.trim()) {

		isSendYn = false;
	} else {
		isSendYn = true;
		let fileDir = "/etc/hamonize/hwinfo/hwinfo.hm";
		fs.writeFile(fileDir, hwData, (err) => {
			if (err) {
				log.info("//== sysInfo hw check() error  " + err.message)
			}
		});
	}

	console.log(ipinfo.address() + "<------ipinfo.address()");
	console.log("isSendYn=========++" + isSendYn);
	// if (isSendYn) {

	var unirest = require('unirest');
	unirest.post('https://' + centerUrl + '/hmsvc/eqhw')
		.header('content-type', 'application/json')
		.send({
			events: [{
				datetime: 'datetime',
				hostname: pcHostname,
				memory: raminfo,
				cpuid: cpuid,
				hddinfo: diskInfo,
				hddid: diskSerialNum,
				ipaddr: ipinfo.address(),
				vpnip: vpnInfo,
				uuid: machindid,
				user: usernm,
				macaddr: pcuuid.macs[0],
				cpuinfo: cpuinfo,
				domain: tenantVal
			}]
		})
		.end(function (response) {
			// console.log("response.body==="+JSON.stringify(response));
			console.log("\nbbbresponse.body===" + response.body);
		});
	log.info("telegraf restart");
	// await execShellCommand('service telegraf restart');
	// }


}


















// #----------------------------------------------------------------------------##----------------------------------------------------------------------------#
//	cloud version job 
// #----------------------------------------------------------------------------##----------------------------------------------------------------------------#



// Common] get File Data
function getFileData(_gubun) {
	var output = '';
	var stats = '';
	var filePath = '';

	if (_gubun == 'updt') {
		filePath = "/etc/hamonize/updt/updtInfo.hm";
	} else if (_gubun == 'programblock') {
		filePath = "/etc/hamonize/security/device.hm";
	} else if (_gubun == 'devicepolicy') {
		filePath = "/etc/hamonize/security/device.hm";
	} else if (_gubun == 'progrmblock') {
		filePath = "/etc/hamonize/progrm/progrm.hm";
	} else if (_gubun == 'ufw') {
		filePath = "/etc/hamonize/firewall/firewallInfo.hm";
	}

	log.info("//==get File path " + filePath);


	stats = fs.statSync(filePath);
	if (stats.isFile()) {
		var text = fs.readFileSync(filePath, 'utf8');
		log.info("//== file data : " + text);
		output = text;
	}
	return output;
}

// #----------------------------------------------------------------------------#
//  device job	 																
// #----------------------------------------------------------------------------#
async function fnDeviceJob() {
	var deviceDataObj = getFileData('devicepolicy');
	console.log("deviceDataObj============++" + deviceDataObj);
	var os = new os_func();
	os.execCommand("sudo /usr/local/bin/center-lockdown").then(res => {
		log.info("//== device 정책 :: centor-lockdown load --- > success\n");
		console.log("res==" + res);
		fnDeviceJob_result(deviceDataObj, 'Y');
	}).catch(err => {
		log.info("//==device 정책 :: centor-lockdown load --- > fail\n");
		console.log("err===" + err);
		// fnDeviceJob_result(deviceDataObj, 'N')
	})

}



// 비인가 디바이스 정책 배포 결과 전송 
function fnDeviceJob_result(deviceData, statusyn) {
	var deviceInsData = "";
	var returnDataIns = "";
	var returnDataDel = "";
	var setDeviceJsonReturnData = "";

	var deviceDataObj = JSON.parse(deviceData);

	for (var a in deviceDataObj) {
		console.log("deviceDataObj.INS=============+" + deviceDataObj.INS);
		if (typeof deviceDataObj.INS != 'undefined') {

			returnDataIns = fn_setDeviceJsonReturnData(deviceDataObj.INS, 'Y');
		}
		if (typeof deviceDataObj.DEL != 'undefined') {
			returnDataDel = fn_setDeviceJsonReturnData(deviceDataObj.DEL, 'N');
		}
	}


	if (returnDataIns.length == 0 && returnDataDel.length != 0) {
		setDeviceJsonReturnData = returnDataDel;
	} else if (returnDataIns.length != 0 && returnDataDel.length == 0) {
		setDeviceJsonReturnData = returnDataIns;
	} else if (returnDataIns.length != 0 && returnDataDel.length != 0) {
		setDeviceJsonReturnData = returnDataIns.concat(returnDataDel);
	}


	request.post('https://' + centerUrl + '/act/deviceAct', {
		json: {
			events: setDeviceJsonReturnData
		}
	}, (error, res, body) => {
		if (error) {
			console.error("error===" + error);
			return
		}
		console.log("//==device 정책 배포 결과 전송 :: " + res.statusCode);
	})
}


function fn_setDeviceJsonReturnData(deviceInsData, statusyn) {
	var os = require("os");
	var hostname = os.hostname();
	var arrSetData = new Array();
	var arrDeviceInsData = deviceInsData.split(",");

	for (var a in arrDeviceInsData) {
		if (arrDeviceInsData[a] != '') {
			var product = arrDeviceInsData[a].split(",")[0].split("-")[0];
			var vendorCode = arrDeviceInsData[a].split(",")[0].split("-")[1].split(":")[0];
			var prodcutCode = arrDeviceInsData[a].split(",")[0].split("-")[1].split(":")[1];
			var setData = new Object();

			setData.hostname = hostname;
			setData.uuidVal = uuidVal.trim();
			setData.product = product;
			setData.productCode = prodcutCode;
			setData.vendorCode = vendorCode;
			setData.statusyn = statusyn;
			setData.domain = tenantVal.trim();

			arrSetData.push(setData);
		}

	}

	return arrSetData;
}

// #----------------------------------------------------------------------------#
//  update policy 
// #----------------------------------------------------------------------------#
function fnUpdtAgentAction() {


	outputData = getFileData('updt');
	log.info("//== updt 정책정보 파일 Data is : " + outputData);

	const exec = require('child_process').exec;

	// dev
	// exec(" sudo sh ./shell/updtjob.sh", function (err, stdout, stderr) {

	//real
	exec(" sudo sh /usr/share/hamonize-agent/shell/updtjob.sh", function (err, stdout, stderr) {
		log.info('updt 정책 ::  stdout: ' + stdout);
		log.info('updt 정책 :: stderr: ' + stderr);

		if (err !== null) {
			log.info(' updt 정책 ::  error: ' + err);
		}
	});

}


// #----------------------------------------------------------------------------#
// 프로그램 차단 
// #----------------------------------------------------------------------------#

function fnProgrmJob() {

	var progrmblockDataObj = getFileData('progrmblock');
	console.log("file data ---- " + progrmblockDataObj);
	if (progrmblockDataObj != '') {
		var progrmDataObj = JSON.parse(progrmblockDataObj);
		log.info("//==progrm 정책:: progrmDataObj Data is : " + JSON.stringify(progrmDataObj));
		log.info("//==progrm 정책:: progrmDataObj.INS Data is : " + JSON.stringify(progrmDataObj.INS));
		log.info("//==progrm 정책:: progrmDataObj.DEL Data is : " + JSON.stringify(progrmDataObj.DEL));
	}
	var exec = require('child_process').exec;
	exec('sudo sh /usr/share/hamonize-agent/shell/tmpprogrmjob.sh  ', function (err, stdout, stderr) {
		if (err !== null) {
			log.info('//==progrm 정책::  error: ' + err);
		}
	});


}

// #----------------------------------------------------------------------------#
// 방화벽 
// #----------------------------------------------------------------------------#

function fnFirewallJob() {

	var ufwDataObj = getFileData('ufw');
	var exec = require('child_process').exec;
	exec('sudo sh /usr/share/hamonize-agent/shell/ufwjob.sh  ', function (err, stdout, stderr) {
		if (err !== null) {
			log.info('//== fnFirewallJob error: ' + err);
		}
	});
}



// #----------------------------------------------------------------------------#
// 복구정책 
// #----------------------------------------------------------------------------#
function fnRecovJob() {
	var exec = require('child_process').exec;
	exec('sudo sh /usr/share/hamonize-agent/shell/backupJob_recovery.sh  ', function (err, stdout, stderr) {
		if (err !== null) {
			log.info('//== fnRecovJob error: ' + err);
		}
	});
}



// #----------------------------------------------------------------------------##----------------------------------------------------------------------------#
const { Command } = require('commander');

const program = new Command();

program
	.option('--test')
	.option('--expiry')
	.option('--updt')
	.option('--progrmblock')
	.option('--devicepolicy')
	.option('--ufw')
	.option('--recovery')
	.option('--unauthlog')
	.option('--hwcheck')
	.option('--start')
	.parse();


// To-Do
// getBackupDataCall(uuidVal); // Call 백업 주기 정책 -- 클라우드버전에서는 제외 ( 차후 도입 예정 )

if (program.opts().unauthlog) { sendToCenter_unauth(); }		// 비인가디바이스  - hamonize-process 패키지에서 비인가 로그파일의 내용 유무를 판별하여 hamonize-agent --unauthlog를 실행한다.
if (program.opts().hwcheck) { sysInfo(); }		// hwcheck cli 
if (program.opts().recovery) { fnRecovJob(); }		// recovery cli 
if (program.opts().ufw) { fnFirewallJob(); }		// ufw cli 
if (program.opts().progrmblock) { fnProgrmJob(); }		// program block cli 
if (program.opts().devicepolicy) { fnDeviceJob(); }		// device policy cli 
if (program.opts().updt) { fnUpdtAgentAction(); }		// updt cli 
if (program.opts().start) {		// agent start cli 
	FnMkdir();
	getPollTime(uuidVal);
	sysInfo();


}


if (program.opts().test) {
	sysInfo2();
}

if (program.opts().expiry) {
	check_expiry();
}






// ansible -> agent (정책파일및 Agent실행 ) &&  ansible -> center (결과전송)#############################
// hamonize-agent --progrmblock] 	프로그램 차단 정책 실행 후 결과 전송
// hamonize-agent --devicepolicy]	비인가 디바이스 정책 실행 후 결과 전송
// hamonize-agent --ufw]			방화벽 정책 실행 후 결과 전송
// hamonize-agent --recovery]		복구 정책 실행 후 결과 전송

// service -> agent ######################################
// hamonize-agent --unauthlog]	비인가 디바이스 로그 전송	hamonize-process service -> agent
// 프로그램 차단 실행 결과		hamonize-process service -> agent
// hamonize-agent --updt]			프로그램 설치 및 삭제 정책 실행 후  결과 전송,		hamonize-agent-mngr service -> hamonize-agent --updt


// agent ####################################################
// hamonize-agent --hwcheck]		하드웨어 변경로그 (hw 및 ip 변경 체크 )
// To-do ::: 필수 프로그램 체크.????
// 1. 방화벽 포트 체크 ----->



// ==========================