document.addEventListener('DOMContentLoaded', () => {
  const container = createElement('div');
  container.classList.add('container');
  const charts = document.createElement('div');
  charts.classList.add('charts');
  document.body.appendChild(container);
  container.appendChild(charts);

  const nightButton = createElement('button');
  nightButton.innerText = 'Switch to Night Mode';
  nightButton.classList.add('night-button');
  nightButton.addEventListener('click', () => {
    document.body.classList.toggle('night');

    if (document.body.classList.contains('night')) {
      nightButton.innerText = 'Switch to Day Mode';
    } else {
      nightButton.innerText = 'Switch to Night Mode';
    }
  });

  container.appendChild(nightButton);

  fetch('chart_data.json')
    .then(data => data.json())
    .then(data => {
      data.map((chartData, index) => {
        return new TelegramChart(charts, chartData, {height: 300, title: 'Chart ' + (index + 1)});
      })
    })
});