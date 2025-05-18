// Constants
const FURNACE_LENGTH = 65000;
const FURNACES = ['rp2', 'rp3', 'rp4'];
const FURNACE_LABELS = {
    rp2: 'РП-2',
    rp3: 'РП-3',
    rp4: 'РП-4'
};

// Добавляем стили для индикаторов
const style = document.createElement('style');
style.textContent = `
    .furnace-status {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-left: 10px;
        transition: all 0.3s ease;
        position: relative;
    }
    .status-inactive {
        background-color: #888;
        box-shadow: 0 0 5px rgba(136, 136, 136, 0.5);
    }
    .status-active {
        background-color: #4CAF50;
        box-shadow: 0 0 10px rgba(76, 175, 80, 0.7);
        animation: pulse 2s infinite;
    }
    .status-downtime {
        background-color: #f44336;
        box-shadow: 0 0 10px rgba(244, 67, 54, 0.7);
        animation: blink 1s infinite;
    }
    @keyframes blink {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
    }
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
        100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
    }
    .tab-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
`;
document.head.appendChild(style);

// Добавляем стили для статистики
const statsStyle = document.createElement('style');
statsStyle.textContent = `
    .furnace-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
        padding: 20px;
        background: var(--bg-secondary);
        border-radius: 8px;
    }
    .stat-block {
        padding: 15px;
        background: var(--bg-primary);
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stat-block h3 {
        margin: 0 0 15px 0;
        color: var(--text-primary);
        border-bottom: 2px solid var(--accent-color);
        padding-bottom: 8px;
    }
    .stat-item {
        margin: 10px 0;
        font-size: 1.1em;
        color: var(--text-secondary);
    }
    .stat-item span {
        font-weight: bold;
        color: var(--text-primary);
    }
`;
document.head.appendChild(statsStyle);

// State management
const state = {
    furnaces: {},
    theme: 'light'
};

// Initialize state for each furnace
FURNACES.forEach(furnaceId => {
    state.furnaces[furnaceId] = {
        sheetLength: 800,
        sheetThickness: 0,
        heatingTime: 0,
        sheetsInFurnace: 0,
        cardNumber: '',
        sheetsInCard: 0,
        remainingSheets: 0,
        heatingTimer: null,
        downtimeTimer: null,
        heatingTimeLeft: 0,
        downtimeTimeLeft: 0,
        isDowntime: false,
        isProcessStarted: false,
        journal: [],
        sheetsManual: false
    };
    restoreFurnaceUI(furnaceId);
    validateInputs(furnaceId);
});

// Theme switching
function setTheme(theme) {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    state.theme = theme;
    localStorage.setItem('theme', theme);
}
function getSavedTheme() {
    return localStorage.getItem('theme') || 'light';
}
document.getElementById('themeToggle').addEventListener('click', () => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
});

// --- Реальное время обновления статистики на вкладке отчет ---
let reportStatsInterval = null;

function handleTabSwitch() {
    const activeTab = document.querySelector('.tab-pane.active');
    if (activeTab && activeTab.id === 'report') {
        // Запускаем обновление статистики раз в секунду
        if (!reportStatsInterval) {
            updateFurnaceStats();
            reportStatsInterval = setInterval(updateFurnaceStats, 1000);
        }
    } else {
        // Останавливаем обновление, если уходим с отчета
        if (reportStatsInterval) {
            clearInterval(reportStatsInterval);
            reportStatsInterval = null;
        }
    }
}

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        button.classList.add('active');
        const tabId = button.dataset.tab;
        document.getElementById(tabId).classList.add('active');
        
        // Сохраняем выбранную вкладку
        localStorage.setItem('selectedTab', tabId);
        
        // Добавляем вызов для обновления статистики
        handleTabSwitch();
    });
});

// Initialize furnace controls
function initializeFurnace(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const container = document.getElementById(furnaceId);
    
    // Add event listeners for inputs
    container.querySelector('.sheet-length').addEventListener('input', (e) => {
        furnace.sheetLength = parseInt(e.target.value) || 0;
        furnace.sheetsManual = false;
        calculateSheetsInFurnace(furnaceId);
        validateInputs(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.sheet-thickness').addEventListener('input', (e) => {
        furnace.sheetThickness = parseInt(e.target.value) || 0;
        validateInputs(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.heating-time').addEventListener('input', (e) => {
        furnace.heatingTime = parseFloat(e.target.value) || 0;
        validateInputs(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.sheets-in-furnace').addEventListener('input', (e) => {
        const val = parseInt(e.target.value) || 0;
        furnace.sheetsInFurnace = val;
        furnace.sheetsManual = true;
        validateInputs(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.card-number').addEventListener('input', (e) => {
        furnace.cardNumber = e.target.value;
        validateInputs(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.sheets-in-card').addEventListener('input', (e) => {
        furnace.sheetsInCard = parseInt(e.target.value) || 0;
        furnace.remainingSheets = furnace.sheetsInCard;
        updateRemainingSheets(furnaceId);
        validateInputs(furnaceId);
        saveFurnaceState();
    });
    
    // Add event listeners for buttons
    container.querySelector('.start-process').addEventListener('click', () => {
        startProcess(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.start-downtime').addEventListener('click', () => {
        startDowntime(furnaceId);
        saveFurnaceState();
    });
    
    container.querySelector('.end-downtime').addEventListener('click', () => {
        endDowntime(furnaceId);
        saveFurnaceState();
    });

    // Добавляем обработчик для кнопки сброса
    container.querySelector('.reset-fields').addEventListener('click', () => {
        if (!confirm('Вы действительно хотите сбросить все значения?')) return;
        resetFields(furnaceId);
    });

    // Инициализируем начальное состояние индикатора
    updateFurnaceStatus(furnaceId);
}

// Validate inputs and enable/disable start button
function validateInputs(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const container = document.getElementById(furnaceId);
    const startButton = container.querySelector('.start-process');
    
    const isValid = furnace.sheetLength > 0 &&
                   furnace.sheetThickness > 0 &&
                   furnace.heatingTime > 0 &&
                   furnace.sheetsInFurnace > 0 &&
                   furnace.cardNumber.trim() !== '' &&
                   furnace.sheetsInCard > 0;
    
    startButton.disabled = !isValid || furnace.isProcessStarted;
}

// Функция обновления индикатора состояния печи
function updateFurnaceStatus(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const statusElement = document.querySelector(`.tab-button[data-tab="${furnaceId}"] .furnace-status`);
    if (!statusElement) return;
    
    // Удаляем все классы состояния
    statusElement.classList.remove('status-inactive', 'status-active', 'status-downtime');
    
    // Добавляем нужный класс в зависимости от состояния
    if (!furnace.isProcessStarted) {
        statusElement.classList.add('status-inactive');
    } else if (furnace.isDowntime) {
        statusElement.classList.add('status-downtime');
    } else {
        statusElement.classList.add('status-active');
    }
}

// Модифицируем функцию startProcess
function startProcess(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const container = document.getElementById(furnaceId);
    
    furnace.isProcessStarted = true;
    container.querySelector('.start-process').disabled = true;
    container.querySelector('.start-downtime').disabled = false;
    
    // Disable input fields
    container.querySelectorAll('input').forEach(input => {
        input.disabled = true;
    });
    
    calculateHeatingTime(furnaceId);
    addJournalEntry(furnaceId, 'Запуск процесса', furnace.cardNumber);
    updateFurnaceStatus(furnaceId);
    saveFurnaceState();
}

// Calculate number of sheets in furnace
function calculateSheetsInFurnace(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    if (!furnace.sheetsManual) {
        const baseCount = FURNACE_LENGTH / furnace.sheetLength;
        furnace.sheetsInFurnace = Math.floor(baseCount);
        updateSheetsInFurnace(furnaceId);
    }
    saveFurnaceState();
}

// Calculate heating time
function calculateHeatingTime(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    if (furnace.sheetsInFurnace > 0) {
        const heatingTime = (furnace.sheetThickness * furnace.heatingTime) / furnace.sheetsInFurnace;
        startHeatingTimer(furnaceId, heatingTime);
    }
    saveFurnaceState();
}

// --- Новый универсальный таймер нагрева ---
function startHeatingTimer(furnaceId, duration) {
    const furnace = state.furnaces[furnaceId];
    if (furnace.heatingTimer) clearInterval(furnace.heatingTimer);
    furnace.heatingDuration = Math.round(duration * 60); // seconds
    furnace.heatingStart = Date.now();
    furnace.pauseTotal = 0;
    furnace.pauseStart = null;
    furnace.isProcessStarted = true;
    updateHeatingTimerDisplay(furnaceId);
    furnace.heatingTimer = setInterval(() => {
        updateHeatingTimerDisplay(furnaceId);
    }, 1000);
    saveFurnaceState();
}

function updateHeatingTimerDisplay(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const left = getHeatingTimeLeft(furnaceId);
    
    // Отобразить left
    const container = document.getElementById(furnaceId);
    const minutes = Math.floor(left / 60);
    const seconds = left % 60;
    container.querySelector('.heating-timer span').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Если left === 0 и процесс активен и не в простое — выдать лист
    if (left === 0 && furnace.isProcessStarted && !furnace.isDowntime) {
        clearInterval(furnace.heatingTimer);
        if (furnace.remainingSheets > 0) {
            furnace.remainingSheets--;
            updateRemainingSheets(furnaceId);
            addJournalEntry(furnaceId, 'Выдан лист', furnace.cardNumber);
            startHeatingTimer(furnaceId, (furnace.sheetThickness * furnace.heatingTime) / furnace.sheetsInFurnace);
        }
    }
    saveFurnaceState();
}

function getHeatingTimeLeft(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    if (!furnace.heatingStart) return 0;
    
    const now = Date.now();
    const pause = furnace.pauseTotal || 0;
    const elapsed = Math.floor((now - furnace.heatingStart - pause) / 1000);
    return Math.max(0, (furnace.heatingDuration || 0) - elapsed);
}

// --- Новый простой ---
function startDowntime(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    if (furnace.downtimeTimer) clearInterval(furnace.downtimeTimer);
    furnace.isDowntime = true;
    furnace.downtimeStart = Date.now();
    
    // Останавливаем таймер нагрева
    if (furnace.heatingTimer) {
        clearInterval(furnace.heatingTimer);
        furnace.heatingTimer = null;
    }
    // Сохраняем время начала паузы
    if (!furnace.pauseStart) {
        furnace.pauseStart = Date.now();
    }
    
    const container = document.getElementById(furnaceId);
    container.querySelector('.start-downtime').disabled = true;
    container.querySelector('.end-downtime').disabled = false;
    addJournalEntry(furnaceId, 'Начало простоя', null, true);
    updateFurnaceStatus(furnaceId);
    furnace.downtimeTimer = setInterval(() => {
        updateDowntimeTimerDisplay(furnaceId);
    }, 1000);
    saveFurnaceState();
}

function updateDowntimeTimerDisplay(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    let elapsed = 0;
    if (furnace.downtimeStart) {
        elapsed = Math.floor((Date.now() - furnace.downtimeStart) / 1000);
    }
    const container = document.getElementById(furnaceId);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    container.querySelector('.downtime-timer span').textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    updateFurnaceStats(); // Обновляем статистику при обновлении таймера простоя
    saveFurnaceState();
}

// Модифицируем функцию endDowntime
function endDowntime(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    furnace.isDowntime = false;
    if (furnace.downtimeTimer) {
        clearInterval(furnace.downtimeTimer);
        furnace.downtimeTimer = null;
    }
    
    // Продолжаем нагрев
    if (furnace.pauseStart) {
        furnace.pauseTotal += Date.now() - furnace.pauseStart;
        furnace.pauseStart = null;
    }
    furnace.downtimeStart = null;
    
    const container = document.getElementById(furnaceId);
    container.querySelector('.start-downtime').disabled = false;
    container.querySelector('.end-downtime').disabled = true;
    addJournalEntry(furnaceId, 'Завершение простоя', null, false);
    updateFurnaceStatus(furnaceId);
    
    // Перезапускаем таймер нагрева
    if (furnace.isProcessStarted && furnace.heatingDuration > 0) {
        furnace.heatingTimer = setInterval(() => {
            updateHeatingTimerDisplay(furnaceId);
        }, 1000);
    }
    
    saveFurnaceState();
}

// Update UI elements
function updateSheetsInFurnace(furnaceId) {
    const container = document.getElementById(furnaceId);
    container.querySelector('.sheets-in-furnace').value = state.furnaces[furnaceId].sheetsInFurnace || '';
    saveFurnaceState();
}

function updateRemainingSheets(furnaceId) {
    const container = document.getElementById(furnaceId);
    container.querySelector('.remaining-sheets').value = state.furnaces[furnaceId].remainingSheets;
    saveFurnaceState();
}

function updateHeatingTimer(furnaceId) {
    const container = document.getElementById(furnaceId);
    const minutes = Math.floor(state.furnaces[furnaceId].heatingTimeLeft / 60);
    const seconds = state.furnaces[furnaceId].heatingTimeLeft % 60;
    container.querySelector('.heating-timer span').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    saveFurnaceState();
}

function updateDowntimeTimer(furnaceId) {
    const container = document.getElementById(furnaceId);
    const hours = Math.floor(state.furnaces[furnaceId].downtimeTimeLeft / 3600);
    const minutes = Math.floor((state.furnaces[furnaceId].downtimeTimeLeft % 3600) / 60);
    const seconds = state.furnaces[furnaceId].downtimeTimeLeft % 60;
    container.querySelector('.downtime-timer span').textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    saveFurnaceState();
}

// Journal management
function addJournalEntry(furnaceId, message, cardNumber = null, isDowntimeStart = null) {
    const furnace = state.furnaces[furnaceId];
    const now = new Date();
    // Проверка на дублирование: если последняя запись совпадает по типу и времени (±1.5 сек)
    const last = furnace.journal[furnace.journal.length - 1];
    if (
        last &&
        last.message === message &&
        last.isDowntimeStart === isDowntimeStart &&
        last.cardNumber === cardNumber &&
        Math.abs(new Date(last.timestamp).getTime() - now.getTime()) < 1500
    ) {
        return; // Не добавлять дубликат
    }
    const entry = {
        timestamp: now,
        message,
        cardNumber,
        isDowntimeStart
    };
    furnace.journal.push(entry);
    updateJournal(furnaceId);
    updateReport();
    updateFurnaceStats(); // Обновляем статистику
    saveFurnaceState();
}

function updateJournal(furnaceId) {
    const container = document.getElementById(furnaceId);
    const journalContainer = container.querySelector('.journal-entries');
    journalContainer.innerHTML = '';
    
    state.furnaces[furnaceId].journal.forEach(entry => {
        const entryElement = document.createElement('div');
        entryElement.className = `journal-entry ${entry.isDowntimeStart !== null ? 
            (entry.isDowntimeStart ? 'downtime-start' : 'downtime-end') : ''}`;
        
        const dateObj = new Date(entry.timestamp);
        const timeStr = dateObj.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const message = entry.cardNumber ? 
            `${timeStr} - ${entry.message} (Карточка: ${entry.cardNumber})` :
            `${timeStr} - ${entry.message}`;
        
        entryElement.textContent = message;
        journalContainer.appendChild(entryElement);
    });
    saveFurnaceState();
    setupResetJournalButtons();
}

function updateReport() {
    const reportContainer = document.querySelector('.report-entries');
    reportContainer.innerHTML = '';
    
    FURNACES.forEach(furnaceId => {
        const furnace = state.furnaces[furnaceId];
        const furnaceHeader = document.createElement('h3');
        furnaceHeader.textContent = `Печь ${FURNACE_LABELS[furnaceId]}`;
        reportContainer.appendChild(furnaceHeader);
        
        furnace.journal.forEach(entry => {
            const entryElement = document.createElement('div');
            entryElement.className = `journal-entry ${entry.isDowntimeStart !== null ? 
                (entry.isDowntimeStart ? 'downtime-start' : 'downtime-end') : ''}`;
            
            const dateObj = new Date(entry.timestamp);
            const timeStr = dateObj.toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const message = entry.cardNumber ? 
                `${timeStr} - ${entry.message} (Карточка: ${entry.cardNumber})` :
                `${timeStr} - ${entry.message}`;
            
            entryElement.textContent = message;
            reportContainer.appendChild(entryElement);
        });
    });
    saveFurnaceState();
    setupResetJournalButtons();
}

// Initialize all furnaces
FURNACES.forEach(initializeFurnace);

// --- Firebase Auth ---
// Регистрация пользователя
function registerUser(email, password) {
  return firebase.auth().createUserWithEmailAndPassword(email, password);
}
// Вход пользователя
function loginUser(email, password) {
  return firebase.auth().signInWithEmailAndPassword(email, password);
}
// Выход пользователя
function logoutUser() {
  return firebase.auth().signOut();
}
// Проверка статуса авторизации
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    document.getElementById('auth-modal').style.display = 'none';
    document.querySelector('.tab-content').style.display = '';
    document.querySelector('.tabs').style.display = '';
    document.querySelector('.theme-switch').style.display = '';
    document.querySelector('.user-bar').style.display = '';
    document.getElementById('user-name').textContent = user.email;
    // После входа:
    loadFurnaceState();
    FURNACES.forEach(furnaceId => restoreFurnaceUI(furnaceId));
    FURNACES.forEach(furnaceId => initializeFurnace(furnaceId));
  } else {
    document.getElementById('auth-modal').style.display = 'flex';
    document.querySelector('.tab-content').style.display = 'none';
    document.querySelector('.tabs').style.display = 'none';
    document.querySelector('.theme-switch').style.display = 'none';
    document.querySelector('.user-bar').style.display = 'none';
    document.getElementById('user-name').textContent = '';
  }
});
// --- Обработка формы входа/регистрации ---
window.addEventListener('DOMContentLoaded', () => {
  // Применить сохранённую тему
  setTheme(getSavedTheme());
  // Восстановить выбранную вкладку
  const savedTab = localStorage.getItem('selectedTab');
  if (savedTab) {
    const tabButton = document.querySelector(`.tab-button[data-tab="${savedTab}"]`);
    if (tabButton) tabButton.click();
  }
  // auth logic
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authLogin = document.getElementById('auth-login');
  const authPassword = document.getElementById('auth-password');
  const authPassword2 = document.getElementById('auth-password2');
  const authPassword2Group = document.getElementById('auth-password2-group');
  const authSubmit = document.getElementById('auth-submit');
  const authToggle = document.getElementById('auth-toggle');
  const authError = document.getElementById('auth-error');
  const logoutBtn = document.getElementById('logout-btn');
  let isRegister = false;
  function switchMode(register) {
    isRegister = register;
    authTitle.textContent = register ? 'Регистрация' : 'Вход';
    authSubmit.textContent = register ? 'Зарегистрироваться' : 'Войти';
    authToggle.textContent = register ? 'Вход' : 'Регистрация';
    authPassword2Group.style.display = register ? '' : 'none';
    authError.textContent = '';
    authForm.reset();
  }
  authToggle.onclick = () => switchMode(!isRegister);
  authForm.onsubmit = e => {
    e.preventDefault();
    const email = authLogin.value.trim();
    const pass = authPassword.value;
    const pass2 = authPassword2.value;
    if (!email || !pass || (isRegister && !pass2)) {
      authError.textContent = 'Заполните все поля!';
      return;
    }
    if (isRegister) {
      if (pass !== pass2) {
        authError.textContent = 'Пароли не совпадают!';
        return;
      }
      registerUser(email, pass)
        .then(() => {
          authError.textContent = '';
          // Сбросить все пользовательские данные для нового пользователя
          FURNACES.forEach(furnaceId => {
            state.furnaces[furnaceId] = {
              sheetLength: 800,
              sheetThickness: 0,
              heatingTime: 0,
              sheetsInFurnace: 0,
              cardNumber: '',
              sheetsInCard: 0,
              remainingSheets: 0,
              heatingTimer: null,
              downtimeTimer: null,
              heatingTimeLeft: 0,
              downtimeTimeLeft: 0,
              isDowntime: false,
              isProcessStarted: false,
              journal: [],
              sheetsManual: false
            };
            restoreFurnaceUI(furnaceId);
          });
          saveFurnaceState();
        })
        .catch(err => authError.textContent = err.message);
    } else {
      loginUser(email, pass)
        .then(() => { authError.textContent = ''; })
        .catch(err => authError.textContent = err.message);
    }
  };
  logoutBtn.onclick = () => {
    logoutUser();
  };
  setTimeout(setupResetJournalButtons, 500);
  handleTabSwitch();
});
// --- END Firebase Auth интеграция ---

// --- СОХРАНЕНИЕ/ЗАГРУЗКА ДАННЫХ ПЕЧЕЙ ---
function getFurnaceStorageKey() {
    const user = getCurrentUser();
    return user ? `furnaceData_${user}` : null;
}
function saveFurnaceState() {
    const key = getFurnaceStorageKey();
    if (!key) return;
    const data = {};
    FURNACES.forEach(furnaceId => {
        const f = state.furnaces[furnaceId];
        data[furnaceId] = {
            sheetLength: f.sheetLength,
            sheetThickness: f.sheetThickness,
            heatingTime: f.heatingTime,
            sheetsInFurnace: f.sheetsInFurnace,
            cardNumber: f.cardNumber,
            sheetsInCard: f.sheetsInCard,
            remainingSheets: f.remainingSheets,
            isDowntime: f.isDowntime,
            isProcessStarted: f.isProcessStarted,
            journal: f.journal,
            sheetsManual: f.sheetsManual,
            heatingDuration: f.heatingDuration || 0,
            heatingStart: f.heatingStart || null,
            pauseTotal: f.pauseTotal || 0,
            pauseStart: f.pauseStart || null,
            downtimeStart: f.downtimeStart || null,
            heatingTimeLeft: getHeatingTimeLeft(furnaceId)
        };
    });
    localStorage.setItem(key, JSON.stringify(data));
}
function loadFurnaceState() {
    const key = getFurnaceStorageKey();
    if (!key) return;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    
    FURNACES.forEach(furnaceId => {
        if (data[furnaceId]) {
            const f = state.furnaces[furnaceId];
            Object.assign(f, data[furnaceId]);
            
            // Восстанавливаем UI
            restoreFurnaceUI(furnaceId);
            
            // Восстанавливаем таймеры
            if (f.isProcessStarted) {
                if (f.isDowntime) {
                    // Если печь в простое
                    if (!f.downtimeTimer) {
                        const container = document.getElementById(furnaceId);
                        if (container) {
                            container.querySelector('.start-downtime').disabled = true;
                            container.querySelector('.end-downtime').disabled = false;
                        }
                        f.downtimeTimer = setInterval(() => {
                            updateDowntimeTimerDisplay(furnaceId);
                        }, 1000);
                    }
                } else if (f.heatingDuration > 0) {
                    // Если печь работает
                    if (!f.heatingTimer) {
                        f.heatingTimer = setInterval(() => {
                            updateHeatingTimerDisplay(furnaceId);
                        }, 1000);
                    }
                }
            }
            
            // Обновляем индикатор состояния
            updateFurnaceStatus(furnaceId);
        }
    });
    
    // Обновляем статистику после загрузки состояния
    updateFurnaceStats();
}

// Модифицируем функцию restoreFurnaceUI
function restoreFurnaceUI(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const container = document.getElementById(furnaceId);
    container.querySelector('.sheet-length').value = furnace.sheetLength || 800;
    container.querySelector('.sheet-thickness').value = furnace.sheetThickness || '';
    container.querySelector('.heating-time').value = furnace.heatingTime || '';
    container.querySelector('.sheets-in-furnace').value = furnace.sheetsInFurnace || '';
    container.querySelector('.card-number').value = furnace.cardNumber || '';
    container.querySelector('.sheets-in-card').value = furnace.sheetsInCard || '';
    container.querySelector('.remaining-sheets').value = furnace.remainingSheets || '';
    container.querySelector('.heating-timer span').textContent =
        furnace.heatingTimeLeft ?
        `${String(Math.floor(furnace.heatingTimeLeft/60)).padStart(2,'0')}:${String(furnace.heatingTimeLeft%60).padStart(2,'0')}` : '00:00';
    container.querySelector('.downtime-timer span').textContent =
        furnace.downtimeTimeLeft ?
        `${String(Math.floor(furnace.downtimeTimeLeft/3600)).padStart(2,'0')}:${String(Math.floor((furnace.downtimeTimeLeft%3600)/60)).padStart(2,'0')}:${String(furnace.downtimeTimeLeft%60).padStart(2,'0')}` : '00:00:00';
    // Кнопки и блокировка
    container.querySelectorAll('input').forEach(input => {
        input.disabled = !!furnace.isProcessStarted;
    });
    container.querySelector('.start-process').disabled = furnace.isProcessStarted || !(
        furnace.sheetLength > 0 &&
        furnace.sheetThickness > 0 &&
        furnace.heatingTime > 0 &&
        furnace.sheetsInFurnace > 0 &&
        furnace.cardNumber.trim() !== '' &&
        furnace.sheetsInCard > 0
    );
    container.querySelector('.start-downtime').disabled = !furnace.isProcessStarted || furnace.isDowntime;
    container.querySelector('.end-downtime').disabled = !furnace.isProcessStarted || !furnace.isDowntime;
    updateJournal(furnaceId);
    updateFurnaceStatus(furnaceId);
}

// --- ДОБАВИТЬ В КОНЕЦ initializeFurnace ---
// После инициализации UI
// restoreFurnaceUI(furnaceId); // УДАЛЕНО, чтобы не было ошибки ReferenceError

// --- ДОБАВИТЬ В addJournalEntry ---
// После updateJournal(furnaceId); updateReport();
// saveFurnaceState();

// --- ФУНКЦИЯ ПОЛНОГО СБРОСА ДАННЫХ ---
function clearAllUserData() {
    const user = getCurrentUser();
    if (user) {
        localStorage.removeItem(`furnaceData_${user}`);
    }
    // Можно также очистить другие ключи, если нужно
    location.reload();
}

// --- ДОБАВИТЬ КНОПКУ ОЧИСТИТЬ ВСЁ В ИНТЕРФЕЙС (например, рядом с кнопкой выйти) ---
// В index.html:
// <button id="clear-all-btn" style="background:#444;color:#fff;margin-left:10px;"><i class="fa-solid fa-trash"></i> Очистить всё</button>
// В script.js:
document.getElementById('clear-all-btn').onclick = clearAllUserData;

// --- Сброс журнала печи с подтверждением пароля администратора ---
function setupResetJournalButtons() {
    document.querySelectorAll('.furnace-journal .reset-journal').forEach((btn, idx) => {
        btn.onclick = function() {
            const password = prompt('Введите пароль администратора для сброса журнала:');
            if (password === 'asd89619320504777') {
                const furnaceId = ['rp2', 'rp3', 'rp4'][idx];
                state.furnaces[furnaceId].journal = [];
                updateJournal(furnaceId);
                updateReport();
                saveFurnaceState();
                alert('Журнал успешно очищен!');
            } else if (password !== null) {
                alert('Неверный пароль администратора!');
            }
        };
    });
}

// Модифицируем функцию reset-fields
function resetFields(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    const container = document.getElementById(furnaceId);
    
    // Сбрасываем все значения
    furnace.sheetLength = 800;
    furnace.sheetThickness = 0;
    furnace.heatingTime = 0;
    furnace.sheetsInFurnace = 0;
    furnace.cardNumber = '';
    furnace.sheetsInCard = 0;
    furnace.remainingSheets = 0;
    furnace.sheetsManual = false;
    furnace.isProcessStarted = false;
    furnace.isDowntime = false;
    
    // Останавливаем таймеры
    if (furnace.heatingTimer) clearInterval(furnace.heatingTimer);
    if (furnace.downtimeTimer) clearInterval(furnace.downtimeTimer);
    furnace.heatingTimer = null;
    furnace.downtimeTimer = null;
    furnace.heatingTimeLeft = 0;
    furnace.downtimeTimeLeft = 0;
    furnace.heatingStart = null;
    furnace.downtimeStart = null;
    furnace.pauseStart = null;
    furnace.pauseTotal = 0;
    
    // Разблокируем все поля
    container.querySelectorAll('input').forEach(input => {
        input.disabled = false;
    });
    
    // Сбрасываем значения в полях
    container.querySelector('.sheet-length').value = 800;
    container.querySelector('.sheet-thickness').value = '';
    container.querySelector('.heating-time').value = '';
    container.querySelector('.sheets-in-furnace').value = '';
    container.querySelector('.card-number').value = '';
    container.querySelector('.sheets-in-card').value = '';
    container.querySelector('.remaining-sheets').value = '';
    
    // Сбрасываем таймеры на экране
    container.querySelector('.heating-timer span').textContent = '00:00';
    container.querySelector('.downtime-timer span').textContent = '00:00:00';
    
    // Обновляем состояние кнопок
    container.querySelector('.start-process').disabled = true;
    container.querySelector('.start-downtime').disabled = false;
    container.querySelector('.end-downtime').disabled = true;
    
    updateFurnaceStatus(furnaceId); // Обновляем индикатор на серый
    saveFurnaceState();
}

// Функция подсчета статистики для печи
function calculateFurnaceStats(furnaceId) {
    const furnace = state.furnaces[furnaceId];
    let totalSheets = 0;
    let totalDowntime = 0;
    let currentDowntime = 0;
    
    // Подсчитываем количество листов и время простоя из журнала
    furnace.journal.forEach(entry => {
        if (entry.message === 'Выдан лист') {
            totalSheets++;
        } else if (entry.message === 'Начало простоя') {
            currentDowntime = new Date(entry.timestamp).getTime();
        } else if (entry.message === 'Завершение простоя' && currentDowntime) {
            const endTime = new Date(entry.timestamp).getTime();
            totalDowntime += Math.floor((endTime - currentDowntime) / (1000 * 60)); // конвертируем в минуты
            currentDowntime = 0;
        }
    });
    
    // Если печь сейчас в простое, добавляем текущее время простоя
    if (furnace.isDowntime && furnace.downtimeStart) {
        const currentTime = Date.now();
        totalDowntime += Math.floor((currentTime - furnace.downtimeStart) / (1000 * 60));
    }
    
    return { totalSheets, totalDowntime };
}

// Функция обновления статистики
function updateFurnaceStats() {
    FURNACES.forEach(furnaceId => {
        const stats = calculateFurnaceStats(furnaceId);
        document.getElementById(`${furnaceId}-total-sheets`).textContent = stats.totalSheets;
        document.getElementById(`${furnaceId}-total-downtime`).textContent = stats.totalDowntime;
    });
}

function getCurrentUser() {
    return firebase.auth().currentUser ? firebase.auth().currentUser.email : null;
} 