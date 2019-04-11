document.addEventListener('DOMContentLoaded', () => {
  const chartsData = [
    {
      title: 'Users',
      url: 'data/1'
    },
    {
      title: 'Interactions',
      url: 'data/2'
    },
    {
      title: 'Fruits',
      url: 'data/3'
    },
    {
      title: 'Views spread',
      url: 'data/4'
    },
    {
      title: 'Also fruits',
      url: 'data/5'
    }
  ];

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

  chartsData.forEach(data => new TelegramChart(charts, data.url, {height: 300, title: data.title}));
});