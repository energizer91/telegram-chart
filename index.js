document.addEventListener('DOMContentLoaded', () => {
  const chartsData = [
    {
      title: 'Users',
      url: 'data/1/overview.json'
    },
    {
      title: 'Reposts',
      url: 'data/2/overview.json'
    },
    {
      title: 'Fruits',
      url: 'data/3/overview.json'
    },
    {
      title: 'Views spread',
      url: 'data/4/overview.json'
    },
    {
      title: 'Also fruits',
      url: 'data/5/overview.json'
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