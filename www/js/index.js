document.addEventListener('deviceready', onDeviceReady, false);
function onDeviceReady() {
    const registerBtn = document.getElementById('register-btn');
    const addContactBtn = document.getElementById('add-contact-btn');
    const addCheckInBtn = document.getElementById('add-checkIn-btn');
    const sendMessageBtn = document.getElementById('send-message-btn');
    registerBtn.addEventListener('click', registerUser);
    addContactBtn.addEventListener('click', () => createContactItem(""));
    addCheckInBtn.addEventListener('click', checkIn);
    sendMessageBtn.addEventListener('click', () => sendSMSToAll("This is a LifePing phone test."));
    // 检查是否已有用户数据 
    checkExistingUser();
    // 动态请求权限 
    requestSMSPermission();
    const settings = getSettings();
    document.getElementById('auto-checkin-toggle').checked = settings.autoCheckin;
    document.getElementById('emergency-hours-slider').value = settings.emergencyHours;
    document.getElementById('warning-hours-slider').value = settings.warningHours;
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('log-out').addEventListener('click', clearAllData);
    enableBackgroundMode();
    startBackgroundCheckLoop();
}
// 设置滑块值
function getSettings() {
    const defaultSettings = {
        emergencyHours: 5,
        warningHours: 2,
        autoCheckin: true
    };
    const saved = localStorage.getItem('lifeping_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
}
// 保存设置
function saveSettings() {
    const settings = {
        emergencyHours: parseInt(document.getElementById('emergency-hours-slider').value),
        warningHours: parseInt(document.getElementById('warning-hours-slider').value),
        autoCheckin: document.getElementById('auto-checkin-toggle').checked
    };
    localStorage.setItem('lifeping_settings', JSON.stringify(settings));
    alert('Settings saved successfully!');
}
function enableBackgroundMode() {
    if (cordova && cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.on('activate', function () {
            cordova.plugins.backgroundMode.disableWebViewOptimizations();
            console.log("Background mode activated.");
        });
        console.log("Background mode enabled.");
    } else {
        console.log("Background mode plugin missing!");
    }
}
function startBackgroundCheckLoop() {
    setInterval(() => {
        const settings = getSettings();
        const emergencyHours = settings.emergencyHours;
        const warningHours = settings.warningHours;
        const checkinHistory = JSON.parse(localStorage.getItem('lifeping_checkin_history') || '[]');
        if (checkinHistory.length === 0) return;
        const lastCheckin = new Date(checkinHistory[checkinHistory.length - 1]);
        const now = new Date();
        const hoursPassed = (now - lastCheckin) / (1000 * 60 * 60);
        // 是否超过应急时间
        if (hoursPassed >= emergencyHours) {
            sendEmergencyNotification();
        }
        if (hoursPassed >= warningHours) {
            if (!(localStorage.getItem('lifeping_warning_sent') === '1')) {
                sendSMSToAll("Hi, this is an LIFEPING automated safety alert. The user may not have checked in for a while. Please try to contact them to ensure they are safe.");
                localStorage.setItem('lifeping_warning_sent', '1');
            }
        }
        if (settings.autoCheckin) {
            autoCheckInIfNeeded();
        }
    }, 5 * 1000);
}
function autoCheckInIfNeeded() {
    const history = JSON.parse(localStorage.getItem('lifeping_checkin_history') || '[]');
    const last = history[history.length - 1];
    const today = new Date().toLocaleDateString();// 如果还没签到（用 toLocaleDateString 比较）
    if (!last || new Date(last).toLocaleDateString() !== today) {
        checkIn();
    }
}
function sendEmergencyNotification() {
    cordova.plugins.notification.local.schedule({
        id: 1001,
        title: "⚠️ Emergency Alert",
        text: "You have not checked in for a long time!",
        foreground: true
    });
}
// 显示注册/签到界面
function showInterface(is_checkin) {
    let A = 'block';
    let B = 'none';
    let C = 'none';
    if (is_checkin) {
        [A, B] = [B, A];
        C = "block";
    }
    document.getElementById('register-container').style.display = A;
    document.getElementById('checkin-container').style.display = B;
    document.getElementById('contacts-container').style.display = C;
    document.getElementById('send-message-btn').style.display = C;
    document.getElementById('settings-container').style.display = C;
}
// 获取紧急联系人
function getEmergencyContacts() {
    const contacts = localStorage.getItem('lifeping_emergency_contacts');
    return contacts ? JSON.parse(contacts) : [];
}
// 加载紧急联系人到界面
function loadEmergencyContacts() {
    const container = document.getElementById('contacts-container');
    // 清除 input + wrapper，但不要删除标题和按钮
    const oldItems = container.querySelectorAll('.contact-item, .contact-input');
    oldItems.forEach(item => item.remove());
    // 读取联系人
    const contacts = getEmergencyContacts();
    // 如果没有联系人，创建 1 个空白输入框
    if (contacts.length === 0) {
        createContactItem();
        saveCurrentContacts();
        return;
    }
    // 有联系人则加载全部
    contacts.forEach(number => {
        createContactItem(number);
    });
}
function createContactItem(value = '') {
    const container = document.getElementById('contacts-container');
    const button = document.getElementById('add-contact-btn');
    const wrapper = document.createElement('div');
    wrapper.className = 'contact-item';
    const input = document.createElement('input');
    input.type = 'tel';
    input.placeholder = 'Enter phone number';
    input.className = 'contact-input';
    input.value = value;
    const delBtn = document.createElement('button');
    delBtn.textContent = "delete";
    delBtn.className = 'delete-btn';
    delBtn.addEventListener('click', () => {
        wrapper.remove();
        saveCurrentContacts();
    });
    input.addEventListener('blur', () => {
        saveCurrentContacts();
    });
    wrapper.appendChild(input);
    wrapper.appendChild(delBtn);
    container.insertBefore(wrapper, button);
}
// 检查是否已有用户数据
function checkExistingUser() {
    const userData = JSON.parse(localStorage.getItem('lifeping_user_data') || 'null');
    if (userData) {//"发现已注册用户:", userData.username
        showInterface(true);
        loadEmergencyContacts();
    } else {//"未发现用户数据，显示注册界面"
        showInterface(false);
    }
    document.getElementById('notification-container').style.display = 'none';
}
//这得优化但是我现在 看不懂
function requestSMSPermission() {
    try {
        const permissions = cordova.plugins.permissions;
        const smsPermission = permissions.SEND_SMS;
        permissions.hasPermission(smsPermission, function (status) {
            if (!status.hasPermission) {
                console.log('请求短信权限...');
                permissions.requestPermission(smsPermission,
                    function (permissionStatus) {
                        if (permissionStatus.hasPermission) {
                            console.log('短信权限已授予');
                            initApp();
                        } else {
                            console.log('用户拒绝了短信权限');
                            initApp(); // 即使拒绝也初始化应用
                        }
                    },
                    function (error) {
                        console.error('权限请求错误:', error);
                        initApp(); // 出错也初始化应用
                    }
                );
            } else {
                console.log('已有短信权限');
                initApp();
            }
        }, function (error) {
            console.error('检查权限时出错:', error);
            initApp();
        });
    } catch (error) {
        console.error('权限系统错误:', error);
        initApp(); // 确保应用总能初始化
    }
}
// 初始化UI和基本功能
function initApp() {
    console.log("App 初始化完成");
    console.log("UI 初始化完成");
}
// 保存用户数据
function saveUserData(userData) {
    try {
        localStorage.setItem('lifeping_user_data', JSON.stringify(userData));
        console.log('User data saved successfully');
        return true;
    } catch (error) {
        console.error('Failed to save user data:', error);
        alert('Failed to save user data, please try again.');
        return false;
    }
}
// 用户注册
function registerUser() {
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    // const contact = document.getElementById('emergency-contact').value.trim();
    if (username && email && password) {
        // 保存用户数据
        const userData = {
            username: username,
            email: email,
            password: password, // 注意：实际应用中应该加密存储
            registeredAt: new Date().toISOString()
        };
        if (saveUserData(userData)) {
            alert("Registration successful!");
            showInterface(true);
            loadEmergencyContacts();
        }
    } else {
        alert("Please fill in all fields!");
    }
}
//每日签到
// function checkIn() {
//     const today = new Date().toISOString();
//     try {
//         // 获取历史签到记录
//         const checkin_History = JSON.parse(localStorage.getItem('lifeping_checkin_history') || '[]');
//         const checkin_Length = checkin_History.length;
//         const lastRaw = checkin_Length ? checkin_History[checkin_Length - 1] : null;
//         let streak = parseInt(localStorage.getItem('lifeping_streak') || '0', 10);
//         const lastDate = lastRaw ? new Date(lastRaw).toLocaleDateString() : null;
//         //更新视觉
//         document.getElementById("checkin-status").textContent = "You have already submitted today’s check-in.";
//         // 添加签到记录
//         checkin_History.push(today);
//         // 历史最多记录 30 天
//         if (checkin_Length > 30) {
//             checkin_History.splice(0, checkin_Length - 30);
//         }
//         // 判断今天是否已经签到
//         if (lastDate === today) {
//             alert("I've already checked in today!");
//         } else {
//             streak++;
//             localStorage.setItem('lifeping_streak', String(streak));
//         }
//         localStorage.setItem('lifeping_checkin_history', JSON.stringify(checkin_History));
//         localStorage.setItem('lifeping_warning_sent', '0');
//         alert("Check-in successful! Current consecutive check-in days:" + streak);
//     } catch (error) {
//         alert('Failed to save check-in record:' + error);
//     }
// }
function checkIn() {
    const now = new Date();
    const todayDateString = now.toLocaleDateString();  // 用于比较
    const isoString = now.toISOString();               // 用于保存
    try {
        // 获取历史签到记录
        const history = JSON.parse(localStorage.getItem('lifeping_checkin_history') || '[]');
        const lastRaw = history.length ? history[history.length - 1] : null;
        const lastDateString = lastRaw ? new Date(lastRaw).toLocaleDateString() : null;
        if (lastDateString === todayDateString) {
            alert("I've already checked in today!");
            return;
        }
        history.push(isoString);
        // 保留 30 条
        if (history.length > 30) {
            history.splice(0, history.length - 30);
        }
        let streak = parseInt(localStorage.getItem('lifeping_streak') || '0', 10);
        streak++;
        localStorage.setItem('lifeping_streak', String(streak));
        localStorage.setItem('lifeping_checkin_history', JSON.stringify(history));
        localStorage.setItem('lifeping_warning_sent', '0');
        document.getElementById("checkin-status").textContent = "You have already submitted today’s check-in.";
        alert("Check-in successful! Current consecutive check-in days: " + streak);
    } catch (error) {
        alert('Failed to save check-in record: ' + error);
    }
}

// 添加新的紧急联系人输入框
// 保存当前所有联系人
function saveCurrentContacts() {
    const inputs = document.querySelectorAll('.contact-input');
    const contacts = [];
    inputs.forEach(input => {
        if (input.value.trim() !== '') {
            contacts.push(input.value.trim());
        }
    });
    // 保存紧急联系人
    localStorage.setItem('lifeping_emergency_contacts', JSON.stringify(contacts));
}
// 发送短信给所有联系人
function sendSMSToAll(message) {
    const contacts = getEmergencyContacts();
    if (!contacts.length) {
        alert("No emergency contact can be sent!");
        return;
    }
    contacts.forEach(number => {
        if (number !== '') {
            // 马来西亚国际格式处理
            let formattedNumber = number;
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '60' + formattedNumber.substring(1);
            }
            if (window.sms) {
                const options = {
                    replaceLineBreaks: false,
                    android: { intent: '' } // 空字符串表示直接发送
                };
                sms.send(formattedNumber, message, options,
                    () => console.log("SMS sent successfully:" + formattedNumber),
                    (err) => console.error("SMS message failed to send:" + formattedNumber, err)
                );
            } else {
                console.warn("The SMS plugin is not installed, so SMS messages cannot be sent.");
                alert("Unable to send SMS messages. Please ensure that cordova-sms-plugin is installed.");
            }
        }
    });
}
// 清除所有数据（用于调试或重置）
function clearAllData() {
    if (confirm('Are you sure you want to clear all data? This will delete all user information and settings.')) {
        localStorage.removeItem('lifeping_user_data');
        localStorage.removeItem('lifeping_emergency_contacts');
        localStorage.removeItem('lifeping_checkin_history');
        localStorage.removeItem('lifeping_streak');
        alert('All data cleared');
        location.reload();
    }
}

