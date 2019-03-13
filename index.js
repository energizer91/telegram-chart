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

const findNode = (ticks, fn) => {
  for (let i = 0; i < ticks.length; i++) {
    if (fn(ticks[i])) {
      return i;
    }
  }

  return -1;
};

const createAnimation = (node, parent, duration = 300) => {
  if (node.dataset.transition) {
    return;
  }
  const start = Date.now();
  const easeInQuad = t => t * t;
  const animationFrameFn = () => {
    const now = Date.now();
    const p = (now - start) / duration;
    const result = easeInQuad(p);
    node.style.opacity = result;
    node.dataset.transition = 'true';
    parent.appendChild(node);

    if (result < 1) {
      requestAnimationFrame(animationFrameFn);
    } else {
      delete node.dataset.transition;
    }
  };

  requestAnimationFrame(animationFrameFn);
};

const removeAnimation = (node, parent, duration = 300) => {
  if (node.dataset.transition) {
    return;
  }

  const start = Date.now();
  const easeInQuad = t => t * t;
  const animationFrameFn = () => {
    const now = Date.now();
    const p = (now - start) / duration;
    const result = easeInQuad(p);
    node.style.opacity = 1 - result;
    node.dataset.transition = 'true';

    if (result >= 1) {
      if (parent.contains(node)) {
        parent.removeChild(node);
      }
    } else {
      requestAnimationFrame(animationFrameFn)
    }
  };

  requestAnimationFrame(animationFrameFn);
};

const svgNS = 'http://www.w3.org/2000/svg';
const findMaximum = array => array.reduce((acc, item) => item > acc ? item : acc, -Infinity);
const findMinimum = array => array.reduce((acc, item) => item < acc ? item : acc, Infinity);
const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

class TelegramChart {
  constructor(selector, data = {}, params = {}) {
    this.container = selector;
    this.params = params;

    this.dimensions = {
      width: this.params.width || this.container.clientWidth,
      height: this.params.height || this.container.clientHeight
    };

    this.createViewport();
    this.createOffsetWrapper();
    this.setDimensions();

    this.xAxis = data.columns.find(column => data.types[column[0]] === 'x').slice(1);
    this.xAxisViewport = null;
    this.widthCoef = (1300 - 350) / (70 - 50);
    this.tickInterval = 0;
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

    this.offsetLeft = 0.3;
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
    document.addEventListener('mouseup', () => {
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
    this.dimensions.width = this.container.clientWidth;

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
      this.xAxisViewport.classList.add('chart__x-axis');

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', 0);
      line.setAttribute('y1', 0);
      line.setAttribute('y2', 0);
      this.xAxisViewport.appendChild(line);

      const tickContainer = document.createElementNS(svgNS, 'g');
      tickContainer.classList.add('chart__x-ticks');
      tickContainer.setAttribute('vector-effect', "non-scaling-stroke");
      this.xAxisViewport.appendChild(tickContainer);

      for (let i = 0; i < this.xAxis.length; i++) {
        const newTick = this.createXTick(this.getDateLabel(this.xAxis[i]), this.xAxis[i]);

        tickContainer.appendChild(newTick);
      }

      this.viewport.appendChild(this.xAxisViewport);
      this.xAxisViewport.style.transform = `translate(0, ${this.dimensions.height}px)`;
    }

    const line = this.xAxisViewport.querySelector('line');

    if (line) {
      line.setAttribute('x2', this.dimensions.width);
    }

    this.createXTicks();
  }

  // createXTicks() {
  //   const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
  //   const oneElementWidth = 70;
  //   // const elementsCount = this.dimensions.width / oneElementWidth;
  //   // const ticksCount = Math.ceil(elementsCount * zoomRatio);
  //   const tickContainer = this.xAxisViewport.querySelector('.chart__x-ticks');
  //   let ticks = tickContainer.querySelectorAll('text');
  //   // let tickInterval = Math.ceil(this.xAxis.length / ticksCount);
  //   let needAnimation = false;
  //
  //   const ticksPerScreen = 5 * zoomRatio;
  //
  //   console.log(zoomRatio.toFixed(1), ticksPerScreen, Math.floor(ticksPerScreen), Math.ceil(ticksPerScreen), Math.round(ticksPerScreen));
  //
  //   const tickInterval = Math.round(Math.min((2 ** Math.max(Math.floor(ticksPerScreen) - Math.round(zoomRatio - 1), 0)), this.xAxis.length - 1)); // every
  //   const ticksCount = Math.min(this.xAxis.length / tickInterval + 1, this.xAxis.length); // have
  //   // const ticksCount = Math.floor(elementsCount * zoomRatio);
  //
  //   // tickInterval = Math.floor(1 + zoomRatio);
  //
  //   if (this.tickInterval && this.tickInterval !== tickInterval) {
  //     needAnimation = true;
  //     for (let i = 0; i < ticks.length; i++) {
  //       if (Number(ticks[i].dataset.index) % tickInterval === 0) {
  //         continue;
  //       }
  //       removeAnimation(ticks[i], tickContainer);
  //     }
  //   }
  //
  //   this.tickInterval = tickInterval;
  //
  //   // TODO: refactor this code so we can reuse old texts
  //   for (let i = 0; i < ticksCount; i++) {
  //     const newIndex = i * tickInterval;
  //     const position = -this.offsetLeft * this.dimensions.width * zoomRatio + this.dimensions.width / this.xAxis.length * (newIndex) * zoomRatio;
  //     const value = this.xAxis[newIndex];
  //
  //     if (!value) {
  //       continue;
  //     }
  //
  //     if (position >= 0 - oneElementWidth && position <= this.dimensions.width + oneElementWidth) {
  //       const foundTick = findNode(ticks, tick => Number(tick.dataset.index) === newIndex);
  //
  //       if (foundTick < 0) {
  //         const tick = this.createXTick(this.getDateLabel(value), newIndex);
  //
  //         if (needAnimation) {
  //           createAnimation(tick, tickContainer);
  //         } else {
  //           tickContainer.appendChild(tick);
  //         }
  //
  //       }
  //     } else {
  //       const foundTick = findNode(ticks, tick => Number(tick.dataset.value) === value);
  //
  //       if (foundTick >= 0) {
  //         tickContainer.removeChild(ticks[foundTick]);
  //       }
  //     }
  //   }
  //
  //
  //
  //   ticks = tickContainer.querySelectorAll('text');
  //
  //   for (let i = 0; i < ticks.length; i++) {
  //     const index = (ticks[i].dataset.index);
  //     const position = -this.offsetLeft * this.dimensions.width * zoomRatio + this.dimensions.width / this.xAxis.length * index * zoomRatio;
  //
  //     ticks[i].setAttribute('transform', `translate(${position}, 0)`);
  //   }
  // }

  createXTicks() {
    const tickContainer = this.xAxisViewport.querySelector('.chart__x-ticks');
    const ticks = tickContainer.querySelectorAll('text');

    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
    const comfortableCount = ticks.length / 5;
    const tickInterval = Math.floor(Math.log(comfortableCount / zoomRatio)/Math.log(2));
    const removeEvery = Math.round(2 ** (tickInterval + 1));

    for (let i = 0; i < ticks.length; i++) {
      if ((i % removeEvery !== 0) && i !== 0 && i !== ticks.length - 1) {
        ticks[i].style.opacity = 0;
      } else {
        ticks[i].style.opacity = 1;
      }

      const position = -this.offsetLeft * this.dimensions.width * zoomRatio + this.dimensions.width / this.xAxis.length * i * zoomRatio;

      ticks[i].setAttribute('transform', `translate(${position}, 0)`);
    }
  }

  createXTick(label, index) {
    const tick = document.createElementNS(svgNS, 'text');
    tick.innerHTML = label;
    tick.dataset.index = index;

    return tick;
  }

  getDateLabel(time) {
    const date = new Date(time);

    return months[date.getMonth()] + ' ' + date.getDate();
  }

  renderColumns() {

  }

  renderLines() {
    this.findMaximumAndMinimum();
    this.lines.forEach(line => this.renderLine(line));
  }

  renderLine(line, maximum = this.maximum, minimum = this.minimum) {
    if (!line.visible) {
      if (line.viewport) {
        line.viewport.style.opacity = 0;
      }
    } else {
      if (line.viewport) {
        line.viewport.style.opacity = 1;
      }
    }

    if (!line.viewport) {
      line.viewport = document.createElementNS(svgNS, 'path');
      line.viewport.setAttribute('stroke', line.color);
      line.viewport.setAttribute('vector-effect', "non-scaling-stroke");
      this.linesViewport.appendChild(line.viewport);
    }

    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);

    if (this.maximum !== -Infinity && this.minimum !== Infinity) {
      const coords = this.convertLine(line.data, this.dimensions.height, maximum, minimum);

      line.viewport.setAttribute('d', coords);
    }

    line.viewport.style.transform = `translate(${-this.offsetLeft * this.dimensions.width * zoomRatio}px, 0) scale(${zoomRatio}, 1)`;
  }

  renderOffsetLines() {
    this.lines.forEach(line => this.renderOffsetLine(line));
  }

  renderOffsetLine(line) {
    if (!line.visible) {
      if (line.offsetViewport) {
        line.offsetViewport.style.opacity = 0;
        return;
      }
    } else {
      if (line.offsetViewport) {
        line.offsetViewport.style.opacity = 1;
      }
    }

    if (!line.offsetViewport) {
      line.offsetViewport = document.createElementNS(svgNS, 'path');
      line.offsetViewport.setAttribute('stroke', line.color);
      this.offsetLinesWrapper.appendChild(line.offsetViewport);
    }

    if (this.offsetMaximum !== -Infinity && this.offsetMinimum !== Infinity) {
      const coords = this.convertLine(line.data, 50, this.offsetMaximum, this.offsetMinimum);

      line.offsetViewport.setAttribute('d', coords);
    }
  }

  convertLine(data, height, maximum, minimum) {
    return data
      .map((item, index) => {
        const x = (this.dimensions.width / data.length * index).toFixed(3);
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

  render() {
    this.renderXAxis();
    this.renderLines();
    this.renderOffsets();
    this.renderOffsetLines();
  }
}