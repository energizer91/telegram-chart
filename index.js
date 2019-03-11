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
const findMaximum = array => array.reduce((acc, item) => item >= acc ? item : acc, -Infinity);
const findMinimum = array => array.reduce((acc, item) => item <= acc ? item : acc, Infinity);

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

    this.offsetLeft = 0;
    this.offsetRight = 0.7;
    this.maximum = 0;
    this.minimum = 0;

    window.addEventListener('resize', () => {
      this.setDimensions();
      this.render();
    });

    this.createOffsetWrapper();

    this.render();
    console.log(this);
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
    this.offsetWrapper = document.createElementNS(svgNS, 'svg');
    this.offsetWrapper.classList.add('chart__offset-wrapper');

    this.container.appendChild(this.offsetWrapper);

    const mainDrag = document.createElementNS(svgNS, 'rect');
    mainDrag.classList.add('chart__offset-main-drag');
    mainDrag.setAttribute('fill', 'transparent');
    this.offsetWrapper.appendChild(mainDrag);

    const leftDrag = document.createElementNS(svgNS, 'rect');
    leftDrag.classList.add('chart__offset-left-drag');
    leftDrag.setAttribute('fill', 'rgba(0, 0, 0, 0.6)');
    this.offsetWrapper.appendChild(leftDrag);

    const rightDrag = document.createElementNS(svgNS, 'rect');
    rightDrag.classList.add('chart__offset-right-drag');
    rightDrag.setAttribute('fill', 'rgba(0, 0, 0, 0.6)');
    this.offsetWrapper.appendChild(rightDrag);

    const leftSpacer = document.createElementNS(svgNS, 'rect');
    leftSpacer.classList.add('chart__offset-spacer');
    leftSpacer.classList.add('chart__offset-spacer_left');
    leftSpacer.setAttribute('fill', 'rgba(0, 0, 0, 0.4)');
    leftSpacer.setAttribute('x', '0');
    this.offsetWrapper.appendChild(leftSpacer);

    const rightSpacer = document.createElementNS(svgNS, 'rect');
    rightSpacer.classList.add('chart__offset-spacer');
    rightSpacer.classList.add('chart__offset-spacer_right');
    rightSpacer.setAttribute('fill', 'rgba(0, 0, 0, 0.4)');
    this.offsetWrapper.appendChild(rightSpacer);

    let mainDragging = -1;
    let leftDragging = -1;
    let rightDragging = -1;

    document.addEventListener('mousedown', e => {
      console.log('document mousedown', e);
      if (e.target === mainDrag) {
        e.stopPropagation();
        mainDragging = e.clientX - this.offsetLeft * this.dimensions.width;
        console.log('mainDragging', mainDragging);
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
        e.stopPropagation();
        let newLeft = e.clientX - mainDragging;
        let newRight = newLeft + Number(mainDrag.getAttribute('width'));
        console.log(newLeft, newRight);

        if (newLeft < 0) {
          // TODO: Fix jumping
          newRight = e.clientX + mainDragging;
          newLeft = 0;
        }

        if (newRight > this.dimensions.width) {
          newRight = this.dimensions.width;
        }

        this.offsetLeft = newLeft / this.dimensions.width;
        this.offsetRight = newRight / this.dimensions.width;

        this.render();
      } else if (leftDragging >= 0) {
        e.stopPropagation();
        let newPosition = e.clientX - leftDrag.offsetWidth / 2;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width - leftDrag.offsetWidth) {
          newPosition = this.dimensions.width - leftDrag.offsetWidth;
        }

        const newOffsetLeft = newPosition / this.dimensions.width;

        if (newOffsetLeft === this.offsetLeft) {
          return;
        }

        this.offsetLeft = newOffsetLeft;

        this.render();
      } else if (rightDragging >= 0) {
        e.stopPropagation();
        let newPosition = e.clientX - rightDrag.offsetWidth / 2;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width - rightDrag.offsetWidth) {
          newPosition = this.dimensions.width - rightDrag.offsetWidth;
        }

        const newOffsetRight = newPosition / this.dimensions.width;

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

    const leftOffset = this.dimensions.width * this.offsetLeft;
    const rightOffset = this.dimensions.width * (this.offsetRight - this.offsetLeft);

    mainDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('width', rightOffset);

    const leftDrag = this.offsetWrapper.querySelector('.chart__offset-left-drag');
    const rightDrag = this.offsetWrapper.querySelector('.chart__offset-right-drag');
    const leftSpacer = this.offsetWrapper.querySelector('.chart__offset-spacer_left');
    const rightSpacer = this.offsetWrapper.querySelector('.chart__offset-spacer_right');

    if (!leftDrag && !rightDrag && !leftSpacer && !rightSpacer) {
      return;
    }

    leftDrag.setAttribute('x', leftOffset);
    rightDrag.setAttribute('x', rightOffset);

    leftSpacer.setAttribute('width', leftOffset);

    rightSpacer.setAttribute('x', rightOffset);
    rightSpacer.setAttribute('width', this.dimensions.width - rightOffset);
  }

  findMaximumAndMinimum() {
    const elements = this.lines
      .filter(line => line.visible)
      .map(line => line.data.slice(Math.floor(this.offsetLeft * this.xAxis.length), Math.ceil(this.offsetRight * this.xAxis.length)));
    this.maximum = findMaximum(elements
      .map(line => findMaximum(line)));
    this.minimum = findMinimum(elements
      .map(line => findMinimum(line)));
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

    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);

    const coords = line.data
      // .slice(this.offsetLeft, this.offsetRight)
      .map((data, index) => {
        const x = this.dimensions.width / this.xAxis.length * index * zoomRatio;
        const y = data / (this.maximum + this.minimum) * this.dimensions.height;

        if (index === 0) {
          return `M${x},${y}`;
        }

        return `L${x},${y}`;
      })
      .join();

    line.viewport.setAttribute('d', coords);
    line.viewport.style.transform = `translate(${-this.offsetLeft * this.dimensions.width * zoomRatio}px, 0)`;
  }

  renderInfo() {

  }

  renderLineSwitches() {

  }

  render() {
    this.renderXAxis();
    this.renderLines();
    this.renderOffsets();
  }
}