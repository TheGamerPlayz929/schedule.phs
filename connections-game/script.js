const categories = [
    {
        name: "Animals",
        words: ["LION", "TIGER", "BEAR", "WOLF"],
        color: "var(--category-yellow)"
    },
    {
        name: "Fruits",
        words: ["APPLE", "BANANA", "ORANGE", "GRAPE"],
        color: "var(--category-green)"
    },
    {
        name: "Dog Breeds",
        words: ["PUG", "BOXER", "BEAGLE", "HUSKY"],
        color: "var(--category-blue)"
    },
    {
        name: "Things with legs",
        words: ["CHAIR", "TABLE", "STOOL", "PIANO"],
        color: "var(--category-purple)"
    }
];

let gameState = {
    allWords: [],
    selectedWords: [],
    solvedCategories: [],
    mistakesLeft: 4
};

const gameGrid = document.getElementById('game-grid');
const solvedContainer = document.getElementById('solved-categories');
const mistakesDots = document.getElementById('mistakes-dots');
const submitBtn = document.getElementById('submit-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const deselectBtn = document.getElementById('deselect-btn');
const messageContainer = document.getElementById('message-container');

function initGame() {
    gameState.allWords = categories.flatMap(cat => cat.words.map(word => ({
        text: word,
        category: cat.name
    })));
    shuffle(gameState.allWords);
    renderGrid();
    updateMistakes();
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function renderGrid() {
    gameGrid.innerHTML = '';
    gameState.allWords.forEach(wordObj => {
        const card = document.createElement('div');
        card.className = 'card';
        if (gameState.selectedWords.includes(wordObj)) {
            card.classList.add('selected');
        }
        card.textContent = wordObj.text;
        card.addEventListener('click', () => toggleSelection(wordObj));
        gameGrid.appendChild(card);
    });
}

function toggleSelection(wordObj) {
    const index = gameState.selectedWords.indexOf(wordObj);
    if (index > -1) {
        gameState.selectedWords.splice(index, 1);
    } else if (gameState.selectedWords.length < 4) {
        gameState.selectedWords.push(wordObj);
    }
    updateUI();
}

function updateUI() {
    renderGrid();
    submitBtn.disabled = gameState.selectedWords.length !== 4;
    updateMistakes();
}

function updateMistakes() {
    mistakesDots.innerHTML = '';
    for (let i = 0; i < gameState.mistakesLeft; i++) {
        const dot = document.createElement('span');
        dot.className = 'mistake-dot';
        mistakesDots.appendChild(dot);
    }
}

function showMessage(text, duration = 2000) {
    messageContainer.textContent = text;
    setTimeout(() => {
        if (messageContainer.textContent === text) {
            messageContainer.textContent = '';
        }
    }, duration);
}

submitBtn.addEventListener('click', () => {
    if (gameState.selectedWords.length !== 4) return;

    const firstCategory = gameState.selectedWords[0].category;
    const isCorrect = gameState.selectedWords.every(word => word.category === firstCategory);

    if (isCorrect) {
        handleCorrectGuess(firstCategory);
    } else {
        handleIncorrectGuess();
    }
});

function handleCorrectGuess(categoryName) {
    const category = categories.find(cat => cat.name === categoryName);
    gameState.solvedCategories.push(category);
    
    // Remove solved words from allWords
    const solvedWordTexts = gameState.selectedWords.map(w => w.text);
    gameState.allWords = gameState.allWords.filter(w => !solvedWordTexts.includes(w.text));
    
    gameState.selectedWords = [];
    
    renderSolvedCategories();
    renderGrid();
    updateUI();
    
    if (gameState.solvedCategories.length === 4) {
        showMessage("Great job!");
    }
}

function handleIncorrectGuess() {
    gameState.mistakesLeft--;
    updateMistakes();
    
    // Shake effect
    gameGrid.classList.add('shake');
    setTimeout(() => gameGrid.classList.remove('shake'), 500);
    
    if (gameState.mistakesLeft === 0) {
        showMessage("Game Over!");
        submitBtn.disabled = true;
    } else {
        showMessage("Incorrect group");
    }
}

function renderSolvedCategories() {
    solvedContainer.innerHTML = '';
    gameState.solvedCategories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'category-row';
        row.style.backgroundColor = cat.color;
        
        const title = document.createElement('h3');
        title.textContent = cat.name;
        
        const words = document.createElement('p');
        words.textContent = cat.words.join(', ');
        
        row.appendChild(title);
        row.appendChild(words);
        solvedContainer.appendChild(row);
    });
}

shuffleBtn.addEventListener('click', () => {
    shuffle(gameState.allWords);
    renderGrid();
});

deselectBtn.addEventListener('click', () => {
    gameState.selectedWords = [];
    updateUI();
});

initGame();
