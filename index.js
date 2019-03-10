document.addEventListener('DOMContentLoaded', () => {
  fetch('chart_data.json')
    .then(data => data.json())
    .then(data => {
      data.slice(0, 1).map((chartData, index) => {
        const chartContainer = document.createElement('div');
        chartContainer.classList.add('chart');
        chartContainer.id = 'chart' + (index + 1);
        document.body.appendChild(chartContainer);

        return new TelegramChart(chartContainer, chartData, {height: 300});
      })
    })
});

const svgNS = 'http://www.w3.org/2000/svg';
const findMaximum = array => array.reduce((acc, item) => item >= acc ? item : acc, 0);
const findMinimum = array => array.reduce((acc, item) => item <= acc ? item : acc, 0);

class TelegramChart {
  constructor(selector, data = {}, params = {}) {
    this.container = selector;
    this.params = params;

    this.dimensions = {
      width: this.params.width || this.container.offsetWidth,
      height: this.params.height || this.container.offsetHeight
    };

    this.createViewport();
    this.setDimensions();

    this.xAxis = data.columns.find(column => data.types[column[0]] === 'x').slice(1);
    this.xAxisViewport = null;
    this.xAxisTicks = [];
    this.lines = data.columns.filter(column => data.types[column[0]] === 'line').map(line => {
      const id = line[0];

      return {
        id,
        name: data.names[id],
        data: line.slice(1),
        color: data.colors[id],
        viewport: null,
        visible: true
      };
    });

    this.createLinesViewport();

    this.offsetLeft = 50;
    this.offsetRight = this.xAxis.length - 20;
    this.maximum = 0;
    this.minimum = 0;

    window.addEventListener('resize', () => {
      this.setDimensions();
      this.render();
    });

    this.createOffsetWrapper();

    this.render();
  }

  createViewport() {
    this.viewport = document.createElementNS(svgNS, 'svg');
    this.viewport.classList.add('chart__viewport');
    this.container.appendChild(this.viewport);
  }

  createLinesViewport() {
    this.linesViewport = document.createElementNS(svgNS, 'g');
    this.linesViewport.setAttribute('fill', 'none');
    this.linesViewport.setAttribute('stroke-width', '3');
    this.linesViewport.setAttribute('stroke-linecap', 'round');
    this.linesViewport.setAttribute('stroke-linejoin', 'round');
    this.viewport.appendChild(this.linesViewport);
  }

  createOffsetWrapper() {
    this.offsetWrapper = document.createElement('div');
    this.offsetWrapper.classList.add('chart__offset-wrapper');

    this.container.appendChild(this.offsetWrapper);

    const mainDrag = document.createElement('div');
    mainDrag.classList.add('chart__offset-main-drag');
    this.offsetWrapper.appendChild(mainDrag);

    const leftDrag = document.createElement('div');
    leftDrag.classList.add('chart__offset-left-drag');
    mainDrag.appendChild(leftDrag);

    const rightDrag = document.createElement('div');
    rightDrag.classList.add('chart__offset-right-drag');
    mainDrag.appendChild(rightDrag);

    let mainDragging = -1;
    let leftDragging = -1;
    let rightDragging = -1;

    document.addEventListener('mousedown', e => {
      console.log('document mousedown', e);
      if (e.target === mainDrag) {
        e.stopPropagation();
        mainDragging = e.clientX;
        return;
      }
      if (e.target === leftDrag) {
        e.stopPropagation();
        leftDragging = e.clientX;
        return;
      }
      if (e.target === rightDrag) {
        e.stopPropagation();
        rightDragging = e.clientX;
      }
    });
    document.addEventListener('mouseup', e => {
      console.log('document mouseup', e);
      mainDragging = -1;
      leftDragging = -1;
      rightDragging = -1;
    });

    document.addEventListener('mousemove', e => {
      if (mainDragging >= 0) {
        console.log('mainDrag mousemove', e);
        e.stopPropagation();
        let newPosition = e.clientX - mainDrag.offsetWidth / 2;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width - mainDrag.offsetWidth) {
          newPosition = this.dimensions.width - mainDrag.offsetWidth;
        }

        mainDrag.style.left = newPosition + 'px';
        return;
      }
      if (leftDragging >= 0) {
        console.log('leftDrag mousemove', e);
        e.stopPropagation();
        let newPosition = e.clientX - leftDrag.offsetWidth / 2;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width - leftDrag.offsetWidth) {
          newPosition = this.dimensions.width - leftDrag.offsetWidth;
        }

        const newOffsetLeft = Math.round(newPosition / this.dimensions.width * this.xAxis.length);

        if (newOffsetLeft === this.offsetLeft) {
          return;
        }

        this.offsetLeft = newOffsetLeft;

        this.render();
        return;
      }
      if (rightDragging >= 0) {
        console.log('rightDrag mousemove', e);
        e.stopPropagation();
        let newPosition = e.clientX - rightDrag.offsetWidth / 2;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width - rightDrag.offsetWidth) {
          newPosition = this.dimensions.width - rightDrag.offsetWidth;
        }

        const newOffsetRight = Math.round(newPosition / this.dimensions.width * this.xAxis.length);

        if (newOffsetRight === this.offsetRight) {
          return;
        }

        this.offsetRight = newOffsetRight;

        this.render();
      }
    });
  }

  renderOffsets() {
    const mainDrag = this.offsetWrapper.querySelector('.chart__offset-main-drag');

    if (!mainDrag) {
      return;
    }

    const mainLeft = this.dimensions.width / this.xAxis.length * this.offsetLeft;

    mainDrag.style.left = this.dimensions.width / this.xAxis.length * this.offsetLeft + 'px';
    mainDrag.style.width = (this.dimensions.width / this.xAxis.length * this.offsetRight - mainLeft) + 'px';
  }

  findMaximumAndMinimum() {
    this.maximum = findMaximum(this.lines
      .filter(line => line.visible)
      .map(line => findMaximum(line.data)));
    this.minimum = findMinimum(this.lines
      .filter(line => line.visible)
      .map(line => findMinimum(line.data)));
  }

  setDimensions() {
    this.dimensions.width = this.container.offsetWidth;

    this.setViewportAttributes();
  }

  setViewportAttributes() {
    this.viewport.setAttribute('viewBox', `0,0,${this.dimensions.width},${this.dimensions.height}`);
    this.viewport.setAttribute('width', this.dimensions.width);
    this.viewport.setAttribute('height', this.dimensions.height);
  }

  renderXAxis() {
    if (!this.xAxisViewport) {
      this.xAxisViewport = document.createElementNS(svgNS, 'g');
      this.viewport.appendChild(this.xAxisViewport);
      this.xAxisViewport.classList.add('chart__x-axis');
    }

    this.xAxisViewport.setAttribute('transform', `translate(0, ${this.dimensions.height})`);
  }

  renderXTicks() {

  }

  renderColumns() {

  }

  renderLines() {
    this.findMaximumAndMinimum();
    this.lines.forEach(line => this.renderLine(line));
  }

  renderLine(line) {
    if (!line.viewport) {
      line.viewport = document.createElementNS(svgNS, 'path');
      line.viewport.setAttribute('stroke', line.color);
      this.linesViewport.appendChild(line.viewport);
    }

    const coords = line.data
      .slice(this.offsetLeft, this.offsetRight)
      .map((data, index, array) => index === 0 ? `M${index},${data / this.maximum * this.dimensions.height}` : `L${this.dimensions.width / array.length * index},${data / this.maximum * this.dimensions.height}`)
      .join('');

    line.viewport.setAttribute('d', coords);
  }

  renderInfo() {

  }

  renderLineSwitches() {

  }

  render() {
    this.renderXAxis();
    this.renderLines();
    this.renderOffsets();
    console.log(this);
  }
}