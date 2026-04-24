let data;
let goal = 24420;
let period = "";
let myArray = [];

// These will be defined once the page loads
let countdown, output, periodoutput, typeoutput, dateoutput, timeuntiloutput;

async function main() {
    try {
        // 1. Initialize selectors after page is ready
        countdown = document.querySelector('.countdown');
        if (!countdown) return; // Safety check

        output = countdown.innerHTML;
        periodoutput = document.querySelector('.period').innerHTML;
        typeoutput = document.querySelector('.stype').innerHTML;
        dateoutput = document.querySelector('.date').innerHTML;
        timeuntiloutput = document.querySelector('.timeuntil').innerHTML;

        // 2. Fetch Data
        const response = await fetch('data.json');
        data = await response.json();
        
        // 3. Start Loops
        updateSchedule();
        countDownDate();
        setInterval(countDownDate, 1000);
        setInterval(updateSchedule, 1000);
    } catch (e) {
        console.error("Initialization failed:", e);
    }
}

// Keep your original logic functions exactly as they are
const proccessTime = function(time) {
    let displayTime = time;
    if (Math.floor(displayTime / 3600) > 12) { displayTime -= 43200; }
    let h = Math.floor(displayTime / 3600);
    let m = Math.floor((displayTime / 60)) % 60;
    return `${h}:${m < 10 ? "0" : ""}${m}`;
}

function calculateGoal() {
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
        let key = parseInt(k);
        if (key < schoolStart) schoolStart = key;
        myArray.push([periods[key][1], proccessTime(key) + " -> " + proccessTime(periods[key][0])]);
        if (key <= val && key > largestUnder) largestUnder = key;
        if (key > largest) largest = key;
    }

    const timeUntilDiv = document.querySelector('.timeuntil');
    if (largestUnder == -1) {
        goal = schoolStart; period = "Before School";
        if (timeUntilDiv) timeUntilDiv.innerHTML = timeuntiloutput.replace('%inf', "period starts...");
    } else if (periods[largestUnder][0] - val < 0 && largestUnder != largest) {
        if (timeUntilDiv) timeUntilDiv.innerHTML = timeuntiloutput.replace('%inf', "period starts...");
        for (let k in periods) {
            let key = parseInt(k);
            if (key > largestUnder) { goal = key; break; }
        }
        period = "Transition";
    } else {
        period = periods[largestUnder][1];
        goal = periods[largestUnder][0];
        if (timeUntilDiv) timeUntilDiv.innerHTML = timeuntiloutput.replace('%inf', "period ends...");
    }
}

function countDownDate() {
    if (!data) return;
    calculateGoal();
    const date = new Date();
    let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    let timeleft = Math.max(0, goal - val);
    
    let h = Math.floor(timeleft / 3600);
    let m = Math.floor((timeleft % 3600) / 60);
    let s = timeleft % 60;

    document.title = (h === 0) ? `${m}:${(s + '').padStart(2, '0')} PHS` : `${h}:${(m + '').padStart(2, '0')} PHS`;

    // Injecting into the classes
    document.querySelector('.countdown').innerHTML = output.replace('%h', h).replace('%m', m).replace('%s', s);
    document.querySelector('.period').innerHTML = periodoutput.replace('%d', period);
    
    let str = `${date.getMonth() + 1}/${date.getDate()}`;
    if (!(str in data)) { str = "base"; }
    document.querySelector('.stype').innerHTML = typeoutput.replace('%a', data[str][0]);
    
    let ds = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
    document.querySelector('.date').innerHTML = dateoutput.replace('%ss', ds);
}

function updateSchedule() {
    if (!data) return;
    calculateGoal();
    let result = '<table class="table table-dark table-bordered mt-3"><thead><tr><th>Period</th><th>Time</th></tr></thead><tbody>';
    for (let i = 0; i < myArray.length; i++) {
        result += `<tr><td>${myArray[i][0]}</td><td>${myArray[i][1]}</td></tr>`;
    }
    result += "</tbody></table>";
    const schedsDiv = document.querySelector('.scheds');
    if (schedsDiv) schedsDiv.innerHTML = result;
}

// Run when window loads
window.onload = main;
