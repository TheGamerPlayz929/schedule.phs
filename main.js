/** * 1. UPDATED SELECTORS
 * We use IDs now to make it "Modern" and faster 
 */
let countdown = document.querySelector('.countdown-container'); // Changed from .countdown
const output = `
    <div class="time-box"><h3>%h</h3><span>Hours</span></div>
    <div class="time-box"><h3>%m</h3><span>Mins</span></div>
    <div class="time-box"><h3>%s</h3><span>Secs</span></div>`;

// We use the badge and text-teal classes from the new UI
const periodoutput = 'Current Period: <span class="badge bg-teal">%d</span>';
const typeoutput = 'Today\'s Schedule Type: <br> <strong> %a </strong>';
const dateoutput = 'Today\'s Date: <strong> %ss </strong>';
const timeuntiloutput = 'Time until %inf';

// ... (keep your existing main() and helper functions the same) ...

/**
 * 2. UPDATED COUNTDOWNDATE FUNCTION
 * This maps your logic to the new HTML elements
 */
const countDownDate = function() {
    calculateGoal();
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    let str = `${month}/${day}`;
    if (!(str in data)) { str = "base"; }

    let cur = date.getHours();
    let val = cur * 60 * 60 + date.getMinutes() * 60 + date.getSeconds();

    let timeleft = goal - val;
    if (timeleft <= 0) timeleft = 0;
    
    let hours = Math.floor(timeleft / (60 * 60));
    let minutes = Math.floor((timeleft - hours * 60 * 60) / 60);
    let seconds = Math.floor((timeleft - hours * 60 * 60 - minutes * 60));

    // Update Browser Tab Title
    document.title = (hours === 0) ? 
        `${minutes}:${(seconds + '').padStart(2, '0')} PHS Schedule` : 
        `${hours}:${(minutes + '').padStart(2, '0')} PHS Schedule`;

    // 3. TARGETING THE MODERN UI ELEMENTS
    // Update Countdown Boxes
    if (countdown) {
        countdown.innerHTML = output.replace('%h', hours).replace('%m', minutes).replace('%s', seconds);
    }

    // Update Current Period (The Pulse Badge)
    const periodEl = document.querySelector('.period');
    if (periodEl) periodEl.innerHTML = periodoutput.replace('%d', period);

    // Update Schedule Type
    const stypeEl = document.querySelector('.stype');
    if (stypeEl) stypeEl.innerHTML = typeoutput.replace('%a', data[str][0]);

    // Update Date
    let dateObj = new Date();
    let newdate = (dateObj.getMonth() + 1) + "/" + dateObj.getDate() + "/" + dateObj.getFullYear();
    const dateEl = document.querySelector('.date');
    if (dateEl) dateEl.innerHTML = dateoutput.replace('%ss', newdate);
}
