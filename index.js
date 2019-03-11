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
    this.createOffsetWrapper();
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
        offsetViewport: null,
        visible: true
      };
    });

    this.createLinesViewport();
    this.createToggleCheckboxes();

    this.offsetLeft = 0.1;
    this.offsetRight = 0.7;
    this.maximum = 0;
    this.minimum = 0;
    this.offsetMaximum = 0;
    this.offsetMinimum = 0;

    window.addEventListener('resize', () => {
      this.setDimensions();
      this.render();
    });

    this.findOffsetMaximumAndMinimum();

    setTimeout(() => this.render(), 0);
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

    this.offsetLinesWrapper = document.createElementNS(svgNS, 'g');
    this.offsetLinesWrapper.setAttribute('fill', 'none');
    this.offsetLinesWrapper.setAttribute('stroke-width', '1');
    this.offsetLinesWrapper.setAttribute('stroke-linecap', 'round');
    this.offsetLinesWrapper.setAttribute('stroke-linejoin', 'round');
    this.offsetLinesWrapper.classList.add('chart__offset-line-wrapper');
    this.offsetWrapper.appendChild(this.offsetLinesWrapper);

    const mainDrag = document.createElementNS(svgNS, 'rect');
    mainDrag.classList.add('chart__offset-main-drag');
    mainDrag.setAttribute('fill', 'transparent');
    this.offsetWrapper.appendChild(mainDrag);

    const leftSpacer = document.createElementNS(svgNS, 'rect');
    leftSpacer.classList.add('chart__offset-spacer');
    leftSpacer.classList.add('chart__offset-spacer_left');
    leftSpacer.setAttribute('x', '0');
    this.offsetWrapper.appendChild(leftSpacer);

    const rightSpacer = document.createElementNS(svgNS, 'rect');
    rightSpacer.classList.add('chart__offset-spacer');
    rightSpacer.classList.add('chart__offset-spacer_right');
    this.offsetWrapper.appendChild(rightSpacer);

    const leftDrag = document.createElementNS(svgNS, 'rect');
    leftDrag.classList.add('chart__offset-drag');
    leftDrag.classList.add('chart__offset-drag_left');
    leftDrag.setAttribute('fill', 'rgba(0, 0, 0, 0.6)');
    this.offsetWrapper.appendChild(leftDrag);

    const rightDrag = document.createElementNS(svgNS, 'rect');
    rightDrag.classList.add('chart__offset-drag');
    rightDrag.classList.add('chart__offset-drag_right');
    this.offsetWrapper.appendChild(rightDrag);

    let mainDragging = -1;
    let leftDragging = -1;
    let rightDragging = -1;

    document.addEventListener('mousedown', e => {
      console.log('document mousedown', e);
      if (e.target === mainDrag) {
        e.stopPropagation();
        mainDragging = e.clientX - this.offsetLeft * this.dimensions.width;
      } else if (e.target === leftDrag) {
        e.stopPropagation();
        leftDragging = e.clientX - this.offsetLeft * this.dimensions.width;
      } else if (e.target === rightDrag) {
        e.stopPropagation();
        rightDragging = e.clientX - this.offsetRight * this.dimensions.width + 5;
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
        let newRight = newLeft + (this.offsetRight - this.offsetLeft) * this.dimensions.width;

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
        let newPosition = e.clientX - leftDragging;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width) {
          newPosition = this.dimensions.width;
        }

        const newOffsetLeft = newPosition / this.dimensions.width;

        if (newOffsetLeft === this.offsetLeft) {
          return;
        }

        this.offsetLeft = newOffsetLeft;

        this.render();
      } else if (rightDragging >= 0) {
        e.stopPropagation();
        let newPosition = e.clientX - rightDragging;

        if (newPosition < 0) {
          newPosition = 0;
        }

        if (newPosition > this.dimensions.width) {
          newPosition = this.dimensions.width;
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

  createToggleCheckboxes() {
    this.lines.forEach(line => {
      const checkbox = document.createElement('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.setAttribute('checked', line.visible);
      checkbox.classList.add('chart__toggle-check');
      checkbox.addEventListener('change', () => this.toggleLine(line));
      this.container.appendChild(checkbox);
    });
  }

  renderOffsets() {
    const mainDrag = this.offsetWrapper.querySelector('.chart__offset-main-drag');

    if (!mainDrag) {
      return;
    }

    const leftOffset = this.dimensions.width * this.offsetLeft;
    const rightOffset = this.dimensions.width * this.offsetRight;
    const width = rightOffset - leftOffset;

    mainDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('width', width);

    const leftDrag = this.offsetWrapper.querySelector('.chart__offset-drag_left');
    const rightDrag = this.offsetWrapper.querySelector('.chart__offset-drag_right');
    const leftSpacer = this.offsetWrapper.querySelector('.chart__offset-spacer_left');
    const rightSpacer = this.offsetWrapper.querySelector('.chart__offset-spacer_right');

    if (!leftDrag && !rightDrag && !leftSpacer && !rightSpacer) {
      return;
    }

    leftDrag.setAttribute('x', leftOffset);
    rightDrag.setAttribute('x', rightOffset - 5);

    leftSpacer.setAttribute('width', leftOffset);

    rightSpacer.setAttribute('x', rightOffset);
    rightSpacer.setAttribute('width', this.dimensions.width - width);
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

  findOffsetMaximumAndMinimum() {
    const elements = this.lines
      .filter(line => line.visible)
      .map(line => line.data);
    this.offsetMaximum = findMaximum(elements.map(line => findMaximum(line)));
    this.offsetMinimum = findMinimum(elements.map(line => findMinimum(line)));
  }

  setDimensions() {
    this.dimensions.width = this.container.offsetWidth;

    this.setViewportAttributes();
  }

  setViewportAttributes() {
    this.viewport.setAttribute('viewBox', `0,0,${this.dimensions.width},${this.dimensions.height}`);
    this.viewport.setAttribute('width', this.dimensions.width);
    this.viewport.setAttribute('height', this.dimensions.height);

    if (!this.offsetWrapper) {
      return;
    }

    this.offsetWrapper.setAttribute('viewBox', `0,0,${this.dimensions.width},${50}`);
    this.offsetWrapper.setAttribute('width', this.dimensions.width);
    this.offsetWrapper.setAttribute('height', '50');
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
    if (!line.visible && line.viewport) {
      this.linesViewport.removeChild(line.viewport);
      line.viewport = null;
      return;
    }

    if (!line.viewport) {
      line.viewport = document.createElementNS(svgNS, 'path');
      line.viewport.setAttribute('stroke', line.color);
      this.linesViewport.appendChild(line.viewport);
    }

    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
    const coords = this.convertLine(line.data, this.dimensions.height, zoomRatio, this.maximum, this.minimum);

    line.viewport.setAttribute('d', coords);
    line.viewport.style.transform = `translate(${-this.offsetLeft * this.dimensions.width * zoomRatio}px, 0)`;
  }

  renderOffsetLines() {
    this.lines.forEach(line => this.renderOffsetLine(line));
  }

  renderOffsetLine(line) {
    if (!line.visible && line.offsetViewport) {
      this.offsetLinesWrapper.removeChild(line.offsetViewport);
      line.offsetViewport = null;
      return;
    }

    if (!line.offsetViewport) {
      line.offsetViewport = document.createElementNS(svgNS, 'path');
      line.offsetViewport.setAttribute('stroke', line.color);
      this.offsetLinesWrapper.appendChild(line.offsetViewport);
    }

    const coords = this.convertLine(line.data, 50, 1, this.offsetMaximum, this.offsetMinimum);

    line.offsetViewport.setAttribute('d', coords);
  }

  convertLine(data, height, zoomRatio, maximum, minimum) {
    return data
      .map((item, index) => {
        const x = (this.dimensions.width / data.length * index * zoomRatio).toFixed(3);
        const y = (item / (maximum + minimum) * height).toFixed(3);

        if (index === 0) {
          return `M${x},${y}`;
        }

        return `L${x},${y}`;
      })
      .join();
  }

  toggleLine(line) {
    line.visible = !line.visible;

    this.findOffsetMaximumAndMinimum();
    this.render();
  }

  renderInfo() {

  }

  renderLineSwitches() {

  }

  render() {
    this.renderXAxis();
    this.renderLines();
    this.renderOffsets();
    this.renderOffsetLines();
  }
}