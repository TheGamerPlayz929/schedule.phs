// --- CONFIGURATION & GLOBALS ---
let countdown = document.querySelector('.countdown');
const output = countdown.innerHTML;
const periodoutput = document.querySelector('.period').innerHTML;
const typeoutput = document.querySelector('.stype').innerHTML;
const dateoutput = document.querySelector('.date').innerHTML;
const timeuntiloutput = document.querySelector('.timeuntil').innerHTML;

let goal = 24420;
let period = "";
let myArray = [];
let data;

// --- INITIALIZATION ---
async function main() {
    try {
        const response = await fetch('data.json');
        data = await response.json();
        
        updateSchedule();
        countDownDate();

        setInterval(countDownDate, 1000);
        setInterval(updateSchedule, 1000);
    } catch (e) {
        console.error("Error loading data.json", e);
    }
}
main();

// --- LOGIC FUNCTIONS ---
function updateSchedule() {
    calculateGoal();
    let result = '<table class="table table-dark table-bordered mt-3" style="width: 90%; margin: auto;">';
    result += '<thead><tr><th>Period Name</th><th>Time</th></tr></thead><tbody>';

    for (let i = 0; i < myArray.length; i++) {
        result += `<tr><td>${myArray[i][0]}</td><td>${myArray[i][1]}</td></tr>`;
    }
    result += "</tbody></table>";

    const schedsDiv = document.querySelector('.scheds');
    if (schedsDiv) schedsDiv.innerHTML = result;
}

const proccessTime = function(time) {
    // 12-hour conversion logic
    let displayTime = time;
    if (Math.floor(displayTime / 3600) > 12) {
        displayTime -= 43200; // 12 * 60 * 60
    }
    let h = Math.floor(displayTime / 3600);
    let m = Math.floor((displayTime / 60)) % 60;
    return `${h}:${m < 10 ? "0" : ""}${m}`;
}

const calculateGoal = function() {
    if (!data) return;
    const date = new Date();
    let str = `${date.getMonth() + 1}/${date.getDate()}`;
    let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    
    if (!(str in data)) { str = "base"; }
    
    let periods = data[str][1];
    let largestUnder = -1;
    let largest = -1;
    myArray = [];

    let schoolStart = 10000000;
    for (let k in periods) {
        k = parseInt(k);
        if (k < schoolStart) schoolStart = k;
        
        myArray.push([periods[k][1], proccessTime(k) + " -> " + proccessTime(periods[k][0])]);
        
        if (k <= val && k > largestUnder) largestUnder = k;
        if (k > largest) largest = k;
    }

    const timeUntilDiv = document.querySelector('.timeuntil');

    if (largestUnder == -1) {
        goal = schoolStart;
        period = "Before School";
        if (timeUntilDiv) timeUntilDiv.innerHTML = timeuntiloutput.replace('%inf', "period starts...");
    } else if (periods[largestUnder][0] - val < 0 && largestUnder != largest) {
        if (timeUntilDiv) timeUntilDiv.innerHTML = timeuntiloutput.replace('%inf', "period starts...");
        for (let k in periods) {
            k = parseInt(k);
            if (k > largestUnder) {
                goal = k;
                break;
            }
        }
        period = "Transition";
    } else {
        period = periods[largestUnder][1];
        goal = periods[largestUnder][0];
        if (timeUntilDiv) timeUntilDiv.innerHTML = timeuntiloutput.replace('%inf', "period ends...");
    }
}

const countDownDate = function() {
    if (!data) return;
    calculateGoal();
    
    const date = new Date();
    let str = `${date.getMonth() + 1}/${date.getDate()}`;
    if (!(str in data)) { str = "base"; }

    let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    let timeleft = Math.max(0, goal - val);
    
    let hours = Math.floor(timeleft / 3600);
    let minutes = Math.floor((timeleft % 3600) / 60);
    let seconds = timeleft % 60;

    // Browser Title
    document.title = (hours === 0) ? 
        `${minutes}:${(seconds + '').padStart(2, '0')} PHS` : 
        `${hours}:${(minutes + '').padStart(2, '0')} PHS`;

    // UI Updates
    document.querySelector('.countdown').innerHTML = output.replace('%h', hours).replace('%m', minutes).replace('%s', seconds);
    document.querySelector('.period').innerHTML = periodoutput.replace('%d', period);
    document.querySelector('.stype').innerHTML = typeoutput.replace('%a', data[str][0]);
    
    let dateStr = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
    document.querySelector('.date').innerHTML = dateoutput.replace('%ss', dateStr);
}
