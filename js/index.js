function wlanQR(obj) {
	let { ssid, type, psk, hidden } = obj,
		string = "WIFI:";
	if (ssid) string += `S:${ssid};`;
	if (type) string += `T:${type};`;
	if (psk) string += `P:${psk};`;
	if (typeof hidden == "boolean") string += `H:${hidden};`;
	if (string == "WIFI:") return null;
	return string + ";";
}

function qrWlan(string) {
	if (!/^WIFI:/.test(string)) return null;
	let arr = string.replace("WIFI:", "").split(";"),
		obj = {},
		dict = {
			P: "psk",
			T: "type",
			S: "ssid",
			H: "hidden",
		};
	arr.forEach((a) => {
		if (a == "") return;
		let split = a.split(":");
		let key = dict[split[0]];
		if (split[0] == "H") {
			obj[key] = split[1] == "true";
			return;
		}
		obj[key] = split[1];
	});
	return obj;
}

let networks = [];

function init(cb) {
	if (navigator && navigator.engmodeExtension) {
		if (navigator.getDeviceStorages) {
			let storage = navigator.getDeviceStorages("sdcard")[0];
			let executor = navigator.engmodeExtension.startUniversalCommand(`cat /data/misc/wifi/wpa_supplicant.conf > ${storage.storagePath}/wifi_manager.txt`, true);
			executor.onsuccess = () => {
				let file = storage.get("wifi_manager.txt");
				file.onsuccess = function () {
					let reader = new FileReader();
					reader.onload = function () {
						console.log(this.result);
						let arr = this.result
							.match(/network={([^}]*)}/g)
							.map((a) => {
								let obj = {};
								a.replace(/network={\n|\n}|\t/g, "")
									.split("\n")
									.forEach((a) => {
										let split = a.split("=");
										split[1] = split[1].replace(/"/g, "");
										obj[split[0]] = split[1];
									});
								return obj;
							})
							.filter((a) => (a.psk ? true : false));
						console.log(arr);

						let known = navigator.mozWifiManager.getKnownNetworks();
						known.onsuccess = function () {
							let result = this.result;
							window.unsift = result;
							let sift = result
								.filter((a) => arr.find((e) => e.ssid == a.ssid))
								.map((a) => {
									let obj = a;
									obj.psk = arr.find((e) => e.ssid == a.ssid).psk;
									return obj;
								});
							networks = sift;
							console.log(sift);
							cb(networks);
						};

						known.onerror = function () {
							console.error(this);
						};
					};
					reader.onerror = function () {
						console.error(this);
						alert("error occured while reading file, please check console");
					};
					reader.readAsText(this.result);
				};
				file.onerror = function () {
					console.error(this);
					alert("error happened while fetching file, see console");
				};
			};
			executor.onerror = function () {
				console.error(this);
				alert("engmode doesn't work");
			};
		} else alert("device storage not found");
	} else alert("engmode not found");
}

init(() => {
	networks.forEach((a, i) => {
		let item = textToNode(`<div class="list-item" data-index="${i}" tabindex="0"><p class="list-item__text">${a.ssid}</p><p class="list-item__subtext">${a.psk}</p></div>`);
		document.querySelector("#app #content").appendChild(item);
	});
	document.querySelector("#app #content > *").focus();
});

const last = (e) => e[e.length - 1],
	lastIndex = (e) => e.length - 1,
	qrcode = document.getElementById("_qrcode");

window.onkeydown = (e) => {
	const key = e.key,
		qr = document.getElementById("qr"),
		wasOpen = qr.style.display == "none";

	qr.style.display = "none";
	if (document.activeElement.className == "list-item") {
		if (key.includes("Arrow") && /Up|Down/.test(key)) {
			let nav = key == "ArrowUp" ? -1 : 1;
			let array = Array.from(document.querySelectorAll("#app #content > *"));
			let index = array.indexOf(document.activeElement);
			if (index != -1 && array.length > 0) {
				if (nav == -1 && 0 == index) {
					last(array).focus();
				} else if (nav == 1 && index == lastIndex(array)) {
					array[0].focus();
				} else {
					array[index + nav].focus();
				}
			}
		}
		if (key == "Enter" && wasOpen) {
			let { ssid, psk, security, hidden } = networks[Number(document.activeElement.dataset.index)];
			qrjs(wlanQR({ ssid, type: security[0], psk, hidden }), 190, qrcode);
			qr.style.display = "block";
		}
		if (key == "SoftLeft") {
			let scan = new MozActivity({ name: "_managerQR" });
			scan.onsuccess = function () {
				let { psk, type, ssid, hidden } = qrWlan(this.result);
				if (hidden)
					return alert(
						"sorry this app does not support hidden wifi networks, \n" +
							"cyan does not have a wifi router to test\n" +
							`as a fallback here is the json file: ${JSON.stringify({ psk, type, ssid, hidden })}`
					);

				function fallback() {
					// assume, idk how it works really
					// i do not have proper documentation
					// on how wlan qrcodes work, but wikipedia
					// states that it's WEP|WPA|<empty string>
					if (psk && type == "WPA") type = "WPA2-PSK";
					let new_network = new MozWifiNetwork({
						ssid,
						psk,
						password: psk,
						security: [type],
						hidden,
					});
					let associate = navigator.mozWifiManager.associate(new_network);
					associate.onsuccess = associate_success;
					associate.onerror = associate_error;
					console.log(new_network);
					alert(
						"the network was assigned through fallback,\n" +
							"therefore it may not work correctly, \n" +
							`here is the json format ${JSON.stringify({ psk, type, ssid, hidden })}\n` +
							"fallback should happen if there's no way of knowing the available networks"
					);
				}
				function associate_success() {
					console.warn(this);
				}
				function associate_error() {
					console.error(this);
				}

				let scan_network = navigator.mozWifiManager.getNetworks();

				scan_network.onsuccess = function () {
					const result = this.result;
					if (result.length == 0) return fallback();
					console.log("networks found =>", result);
					let find = result.find((a) => a.ssid == ssid);
					if (find) {
						find.psk = psk || null;
						find.password = psk || null;

						let associate = navigator.mozWifiManager.associate(find);
						associate.onsuccess = associate_success;
						associate.onerror = associate_error;

						console.log(find);
					} else fallback();
				};
				scan_network.onerror = fallback;

				console.log("qrcode result: " + this.result);
			};
		}
	}
	if (key == "Backspace") {
		if (qr.style.display == "block") e.preventDefault();
	}
};

function textToNode(string) {
	let el = document.createElement("div");
	el.innerHTML = string;
	return el.firstChild;
}
