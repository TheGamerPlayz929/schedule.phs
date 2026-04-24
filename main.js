/**
 * PHS Schedule Modern Logic
 * Replaces old Maundy template helpers with direct ID targeting
 */

let data;
let goal = 24420;
let period = "";
let myArray = [];

// Modern UI Templates
const countdownPlaceholder = `
    <div class="time-box"><h3>%h</h3><span>Hours</span></div>
    <div class="time-box"><h3>%m</h3><span>Mins</span></div>
    <div class="time-box"><h3>%s</h3><span>Secs</span></div>`;

const periodTemplate = "Current Period: <strong>%d</strong>";
const typeTemplate = "%a";
const dateTemplate = "Today's Date: <strong>%ss</strong>";
const timeUntilTemplate = "Time until %inf";

// Initialize
main();

async function main() {
    try {
        const response = await fetch('data.json');
        data = await response.json();
        
        updateSchedule();
        countDownDate();

        // Real-time updates
        setInterval(countDownDate, 1000);
        setInterval(updateSchedule, 1000);
    } catch (error) {
        console.error("Data Fetch Error:", error);
    }
}

function updateSchedule() {
    calculateGoal();
    let result = '<table class="table table-dark table-bordered mt-3"><thead><tr><th>Period</th><th>Time</th></tr></thead><tbody>';

    for (let i = 0; i < myArray.length; i++) {
        result += `<tr><td>${myArray[i][0]}</td><td>${myArray[i][1]}</td></tr>`;
    }
    result += "</tbody></table>";

    const schedContainer = document.querySelector('.scheds');
    if (schedContainer) schedContainer.innerHTML = result;
}

const proccessTime = function(time) {
    if (Math.floor(time / 3600) > 12) { time -= 43200; }
    return "" + Math.floor(time / 3600) + ":" + (Math.floor((time / 60)) % 60 < 10 ? "0" : "") + Math.floor((time / 60)) % 60;
}

function calculateGoal() {
    if (!data) return;
    const date = new Date();
    let str = `${date.getMonth() + 1}/${date.getDate()}`;
    let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    
    if (!(str in data)) { str = "base"; }
    
    let arr = data[str];
    let periods = arr[1];
    let largestUnder = -1;
    let largest = -1;
    myArray = [];

    let schoolStart = 10000000;
    for (let k in periods) {
        let key = parseInt(k);
        if (key < schoolStart) { schoolStart = key; }
        myArray.push([periods[key][1], proccessTime(key) + " -> " + proccessTime(periods[key][0])]);
        
        if (key <= val && key > largestUnder) { largestUnder = key; }
        if (key > largest) { largest = key; }
    }

    const infoDisplay = document.getElementById('time-until-display');
    
    if (largestUnder == -1) {
        goal = schoolStart;
        period = "Before School";
        if (infoDisplay) infoDisplay.innerHTML = timeUntilTemplate.replace('%inf', "period starts...");
    } else if (periods[largestUnder][0] - val < 0 && largestUnder != largest) {
        if (infoDisplay) infoDisplay.innerHTML = timeUntilTemplate.replace('%inf', "period starts...");
        for (let k in periods) {
            let key = parseInt(k);
            if (key > largestUnder) { goal = key; break; }
        }
        period = "Transition";
    } else {
        period = periods[largestUnder][1];
        goal = periods[largestUnder][0];
        if (infoDisplay) infoDisplay.innerHTML = timeUntilTemplate.replace('%inf', "period ends...");
    }
}

function countDownDate() {
    if (!data) return;
    calculateGoal();
    const date = new Date();
    let str = `${date.getMonth() + 1}/${date.getDate()}`;
    if (!(str in data)) { str = "base"; }

    let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    let timeleft = goal - val;
    if (timeleft <= 0) timeleft = 0;
    
    let h = Math.floor(timeleft / 3600);
    let m = Math.floor((timeleft % 3600) / 60);
    let s = timeleft % 60;

    // Browser Tab Update
    document.title = (h === 0) ? `${m}:${(s + '').padStart(2, '0')} PHS` : `${h}:${(m + '').padStart(2, '0')} PHS`;

    // Inject Modern UI Data
    const cdBox = document.getElementById('countdown-box');
    if (cdBox) cdBox.innerHTML = countdownPlaceholder.replace('%h', h).replace('%m', m).replace('%s', s);
    
    const pBox = document.getElementById('period-display');
    if (pBox) pBox.innerHTML = periodTemplate.replace('%d', period);
    
    const tBox = document.getElementById('schedule-type-display');
    if (tBox) tBox.innerHTML = typeTemplate.replace('%a', data[str][0]);
    
    const dBox = document.getElementById('date-display');
    if (dBox) {
        let ds = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
        dBox.innerHTML = dateTemplate.replace('%ss', ds);
    }
}
