const api = window.maiPet;
const countdown = document.getElementById('countdown');
const timerLabel = document.getElementById('timer-label');
const timerStatus = document.getElementById('timer-status');
const minutesInput = document.getElementById('minutes');
const labelInput = document.getElementById('reminder-label');
const modeInput = document.getElementById('focus-mode');
const presets = document.getElementById('presets');
const startButton = document.getElementById('start-button');
const cancelButton = document.getElementById('cancel-button');
const notice = document.getElementById('notice');

let pendingOperation = '';

let timerState = {
  active: false,
  endAt: 0,
  remainingMs: 0,
  label: '番茄钟',
  mode: 'study'
};

function errorText(error) {
  return (error?.message || String(error) || '发生了未知错误。')
    .replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function remainingTime() {
  return timerState.active ? Math.max(0, timerState.endAt - Date.now()) : 0;
}

function render() {
  const remaining = remainingTime();
  const active = timerState.active && remaining > 0;
  const pending = Boolean(pendingOperation);
  countdown.textContent = formatTime(active ? remaining : (Number(minutesInput.value) || 25) * 60 * 1000);
  timerLabel.textContent = active ? timerState.label : '准备开始';
  timerStatus.textContent = pending ? (pendingOperation === 'start' ? '正在开始计时…' : '正在取消计时…')
    : active ? '麻衣正在替你看着时间' : timerState.endAt > 0 ? '时间到了' : '选择时长后开始';
  startButton.disabled = active || pending;
  cancelButton.disabled = !active || pending;
  startButton.textContent = pendingOperation === 'start' ? '正在开始…' : '开始专注';
  cancelButton.textContent = pendingOperation === 'cancel' ? '正在取消…' : '取消计时';
  for (const input of [minutesInput, labelInput, modeInput]) input.disabled = active || pending;
  for (const button of presets.querySelectorAll('button')) {
    const selected = Number(button.dataset.minutes) === Number(minutesInput.value);
    button.disabled = active || pending;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function selectPreset(minutes) {
  if (pendingOperation || (timerState.active && remainingTime() > 0)) return;
  minutesInput.value = String(minutes);
  for (const button of presets.querySelectorAll('button')) {
    button.classList.toggle('is-selected', Number(button.dataset.minutes) === minutes);
  }
  render();
}

presets.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-minutes]');
  if (button) {
    selectPreset(Number(button.dataset.minutes));
  }
});

minutesInput.addEventListener('input', () => {
  for (const button of presets.querySelectorAll('button')) {
    button.classList.toggle(
      'is-selected',
      Number(button.dataset.minutes) === Number(minutesInput.value)
    );
  }
  render();
});

startButton.addEventListener('click', async () => {
  if (pendingOperation || (timerState.active && remainingTime() > 0)) return;
  notice.textContent = '';
  pendingOperation = 'start';
  render();
  try {
    timerState = await api.startTimer({
      minutes: Number(minutesInput.value),
      label: labelInput.value,
      mode: modeInput.value
    });
    render();
  } catch (error) {
    notice.textContent = errorText(error);
  } finally { pendingOperation = ''; render(); }
});

cancelButton.addEventListener('click', async () => {
  if (pendingOperation || !timerState.active) return;
  notice.textContent = '';
  pendingOperation = 'cancel';
  render();
  try {
    timerState = await api.cancelTimer();
    render();
  } catch (error) {
    notice.textContent = errorText(error);
  } finally { pendingOperation = ''; render(); }
});

setInterval(render, 500);

api.getTimerState().then((state) => {
  timerState = state;
  if (state.active) {
    labelInput.value = state.label;
    modeInput.value = state.mode || 'study';
  }
  render();
}).catch((error) => {
  notice.textContent = errorText(error);
});

api.onTimerState((state) => {
  timerState = state;
  render();
});
