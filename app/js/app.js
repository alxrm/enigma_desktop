var app = function() {
	function getToken() {return localStorage.getItem('access_token')};
	function toDate(unix, full) {var date = new Date(unix*1000);var hours = "0" + date.getHours();var minutes = "0" + date.getMinutes();return (full ? ("0" + date.getDate()).substr(-2) + "." + ("0" + (date.getMonth()+1)).substr(-2) + "." + ("0" + date.getYear()).substr(-2) + " " : "") + (hours.substr(hours.length-2) + ':' + minutes.substr(minutes.length-2)) }
	return {
		user: null,
		opened_chat: 0,
		secured: {},
		init: function() {
			vk.token = getToken();
			var _this = this;
			this.check(function(res) {
				if (res && res.response) {
					var profile = res.response[0];
					localStorage.setItem('profile', JSON.stringify(profile));
					ajax.get('pages/main.html', function(data){ 
						document.body.innerHTML = data;
						$('#user_name').innerHTML = profile.first_name + " " + profile.last_name;
						$('#user_pic').src = profile.photo_100;
						$('.top_user_wrap').onclick = function() {
							localStorage.clear();
							_this.init();
						}
						_this.start();
					});
				} else {
					vk.auth();
				}
			});
		},
		check: function(cb) {
			vk.api('users.get', {fields:"photo_100"}, cb);
		},
		start: function() {
			var _this = this;
			vk.api('execute', {code:"var dialogs = API.messages.getDialogs({count:200}).items,i=-1;var ids=[],d=[];while((i=i+1) < dialogs.length) {var obj = dialogs[i].message;if (!obj.chat_id){d.push(obj);ids.push(obj.user_id);}}return {messages:d, users:API.users.get({user_ids:ids,fields:\"photo_100\"})};"}, function(data) {
				if (data && data.response) {
					var users = {};
					data.response.users.forEach(function(obj) {
						users[obj.id] = obj;
					});
					$('#dialogs').innerHTML = "";
					data.response.messages.forEach(function(obj) {
						var user = users[obj.user_id];
						obj.date = toDate(obj.date);
						obj.photo = user.photo_100;
						obj.name = user.first_name + " " + user.last_name;
						
						if (!obj.body.length && obj.attachments) {
							obj.body = tpl('attach-prev', {msg:obj.attachments[0].type});
						}

						var wrap = document.createElement('div');
							wrap.innerHTML = tpl('dialog', obj);
						var nwrap = wrap.firstChild;
						nwrap.onclick = function() {
							_this.show(obj.user_id);
						}
						$('#dialogs').appendChild(nwrap);
					});
					$('.im_history_wrap').style.display = 'none';
					$('.top_right_wrap').style.display = 'none';

					_this.long();
				}
			});
		},
		long: function() {
			var _this = this;
			vk.api('messages.getLongPollServer', {use_ssl:1}, function(res) {
				if (res && res.response) {
					var srv = "https://" + res.response.server + "?act=a_check&key=" + res.response.key + "&wait=25&mode=2";
					_this.reallong(srv, res.response.ts);
				}
			});
		},
		reallong: function(lnk, ts) {
			var _this = this;
			
			ajax.get(lnk + "&ts=" + ts, function(data) {
				data = JSON.parse(data);
				if (data.updates.length > 0) {
					_this.update(data.updates);
				}
				_this.reallong(lnk, data.ts);
			}, function() {
				_this.reallong(lnk, ts);
			})
		},
		update: function(data) {
			var _this = this;
			data.forEach(function(update) {
				if (update[0] == 4 && update[3] < 2000000000) {
					var id = update[3];
					var msg = update[6];
					var time = update[4];

					var keyStore = _this.secured[id];
					if (msg.substr(0, 10) == 'ECDH_BEGIN') {
						msg = msg.substr(10).split("<br>")[0];
						if ((update[2] & 2)) {
							if (keyStore && keyStore.secretKey) {
								msg = tpl('service', {msg:'Keys aproved.'});
								$('.locker').className = $('.locker').className.replace('locked', '') + " locked";
							} else if (keyStore) {
								msg = tpl('service', {msg:'Waiting keys ...'});
							}
						} else {
							if (keyStore) {
								keyStore.getPartnerKey(msg);
								msg = tpl('service', {msg:"Key genered!"});
								$('.locker').className = $('.locker').className.replace('locked', '') + " locked";
							} else {
								_this.secured[id] = new VKKeyExchanging(id);	
								_this.secured[id].sendMyPublicKey();		
								_this.secured[id].getPartnerKey(msg);
								msg = tpl('service', {msg:"Key genered!"});
							}
						}
					} else if (msg.substr(0, 15) == 'ENCRYPTED_BEGIN') {
						if (keyStore && keyStore.secretKey) {
							msg = msg.substr(15).split("<br>")[0];
							try {
								msg = tpl('encrypted', {msg:CryptoJS.AES.decrypt(atob(msg), keyStore.secretKey).toString(CryptoJS.enc.Utf8)});
							} catch (_) {
								
							}
						}	
					} else if (msg.substr(0, 13) == 'ENCRYPTED_END') {
						delete _this.secured[_this.opened_chat];
						$('.locker').className = $('.locker').className.replace('locked', '');
						msg = tpl('service', {msg:'Encryption ended.'});
					}



					_this.renderMsg(id, msg, time, (update[2] & 2));
				}
			});
		},
		renderMsg: function(uid, msg, time, out) {
			var current = JSON.parse(localStorage.getItem('profile'));
			var wrap = $('#dialog_' + uid), nwrap = wrap, _this = this;
			if (wrap) {
				wrap.parentNode.removeChild(wrap);
				nwrap.querySelector('.im_dialog_message').innerHTML = msg;
				nwrap.querySelector('.im_dialog_meta').innerHTML = toDate(time);	
				nwrap.onclick = function() {
					_this.show(uid);
				}
				$('#dialogs').insertBefore(nwrap, $('#dialogs').firstChild);
			}

			vk.api('users.get', {user_id:uid, fields:"photo_100"}, function(data) {
				if (data && data.response) {
					var user = data.response[0];
					if (_this.opened_chat == uid) {
						var wrap2 = document.createElement('div'), mwrap2;

						wrap2.innerHTML = tpl('msg', {
							"photo": out ? current.photo_100 : user.photo_100,
							"name": out ? current.first_name + " " + current.last_name : user.first_name + " " + user.last_name,
							"text": msg,
							"date": toDate(time, true),
							"attachments": ""
						});
						mwrap2 = wrap2.firstChild;
						$('.im_history_chat').appendChild(mwrap2);
						var topPos = $('.im_history_chat').lastChild.offsetTop;
						$('.im_history_chat_wrap').scrollTop = topPos;
					}

					if (!nwrap) {
						wrap = document.createElement('div');
						wrap.innerHTML = tpl('dialog', {
							"body": msg,
							"name": user.first_name + " " + user.last_name,
							"photo": user.photo_100,
							"date": toDate(time),
							"user_id": uid
						});
						nwrap = wrap.firstChild;
						nwrap.onclick = function() {
							_this.show(uid);
						}
						$('#dialogs').insertBefore(nwrap, $('#dialogs').firstChild);	
					}
				}
			});
		}, 
		show: function(uid) {
			if (uid === this.opened_chat) return;
			var _this = this;
			var current = JSON.parse(localStorage.getItem('profile'));
			vk.api('users.get', {user_id:uid, fields:"online,photo_100"}, function(data) {
				if (data && data.response) {
					_this.opened_chat = uid;
					var keyStore = _this.secured[uid];
					if (keyStore && keyStore.secretKey) {
						$('.locker').className = $('.locker').className.replace('locked') + " locked";
					} else {
						$('.locker').className = $('.locker').className.replace('locked');
					}
					var user = data.response[0];
					$('.top_right_wrap').style.display = 'block';
					$('.im_history_wrap').style.display = 'block';
					$('.chat_name').innerHTML = user.first_name + " " + user.last_name;
					$('.chat_members_status').innerHTML = user.online ? "online" : "offline";
					vk.api('messages.getHistory', {count:200, user_id:uid}, function(data) {
						$('.im_history_chat').innerHTML = '';
						if (data && data.response) {
							data.response.items.reverse().forEach(function(msg) {
								var attachments = '';
								if (msg.attachments) {
									msg.attachments.forEach(function(att) {
										switch (att.type) {
											case 'sticker':
												attachments += tpl('attach-sticker', {img:att.sticker.photo_256})
												break;
											case 'wall':
												console.log()
												attachments += tpl('attach-wall', att.wall);
												break;
											default:
												console.log(att);
										}
									});
								}
								if (msg.body.substr(0, 10) == 'ECDH_BEGIN') {
									return;
								}
								if (msg.body.substr(0,13) == 'ENCRYPTED_END') {
									return;
								}
								if (msg.body.substr(0, 15) == 'ENCRYPTED_BEGIN') {
									var keyStore = _this.secured[uid];
									if (keyStore && keyStore.secretKey) {
										msg.body = msg.body.substr(15).split("<br>")[0];
										try {
											msg.body = tpl('encrypted', {msg:CryptoJS.AES.decrypt(atob(msg.body), keyStore.secretKey).toString(CryptoJS.enc.Utf8)});
										} catch (_) {
											return;
										}
									} else {
										return;
									}
								}
								var wrap = document.createElement('div'), mwrap;
								wrap.innerHTML = tpl('msg', {
									"photo": msg.from_id == user.id ? user.photo_100 : current.photo_100,
									"name": msg.from_id == user.id ? user.first_name + " " + user.last_name : current.first_name + " " + current.last_name,
									"text": msg.body,
									"date": toDate(msg.date, true),
									"attachments": attachments
								});
								mwrap = wrap.firstChild;
								$('.im_history_chat').appendChild(mwrap);
							});
							setTimeout(function(){
								var topPos = $('.im_history_chat').lastChild.offsetTop;
								$('.im_history_chat_wrap').scrollTop = topPos * 1000;
							},100);
							$('.im_message_field').onkeydown = function(e) {
								if (e.keyCode == 13 && !e.shiftKey) {
									
									_this.sendMsg();
								}
							}
							$('.im_message_send_btn_wrap').onclick = _this.sendMsg;
							$('.locker').onclick = function() {
								_this.switchChat();
							};
						}
					});
				}
			});			 
		},
		sendMsg: function() {
			var msg = $('.im_message_field').innerHTML.replace(/\<br\>/g, "\n").replace(/<[^<>]+>/g, '');
			$('.im_message_field').innerHTML = '';
			var keyStore = this.secured[this.opened_chat];
			if (keyStore && keyStore.secretKey) {
				var encryptedMsg = (CryptoJS.AES.encrypt(msg, keyStore.secretKey)).toString();	 
				vk.api('messages.send', { user_id: this.opened_chat, message: "ENCRYPTED_BEGIN" + btoa(encryptedMsg) + "\n======================\nIf you dont known WTF go to blablabla.com" }, function(r){ });  
			} else {
				vk.api('messages.send', {message:msg, user_id:this.opened_chat}, function() { });	
			}						
		},
		switchChat: function() {
			if (this.secured[this.opened_chat]) {
				this.unsecure();
			} else {
				this.secure();
			}
		}, 
		unsecure: function() {
			delete this.secured[this.opened_chat];
			vk.api('messages.send', { user_id: this.opened_chat, message: "ENCRYPTED_END"}, function(){});
			$('.locker').className = $('.locker').className.replace('locked', '');
		},
		secure: function() {
			var ke = new VKKeyExchanging(this.opened_chat);	
			ke.sendMyPublicKey();		
			this.secured[this.opened_chat] = ke;
			$('.locker').className = $('.locker').className.replace('locked', '') + " locked";
		}
	}
}

app.init = function() {
	var shared = new app();
	app.shared = shared;
	shared.init();
}

window.onload = app.init;
